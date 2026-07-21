package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/novex-labs/reelix/server/internal/auth"
	"github.com/novex-labs/reelix/server/internal/db"
)

const sessionTTL = 30 * 24 * time.Hour

type userDTO struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Role     string `json:"role"`
}

func toUserDTO(u db.User) userDTO {
	return userDTO{ID: u.ID, Username: u.Username, Role: u.Role}
}

type profileDTO struct {
	ID          int64   `json:"id"`
	DisplayName string  `json:"displayName"`
	Avatar      *string `json:"avatar"`
	IsKid       bool    `json:"isKid"`
}

func toProfileDTO(p db.Profile) profileDTO {
	return profileDTO{ID: p.ID, DisplayName: p.DisplayName, Avatar: p.Avatar, IsKid: p.IsKid}
}

func (s *Server) setSessionCookie(w http.ResponseWriter, sessionID string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Expires:  expiresAt,
	})
}

func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	count, err := s.users.Count(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"needsSetup": count == 0})
}

type setupAdminRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleSetupAdmin(w http.ResponseWriter, r *http.Request) {
	count, err := s.users.Count(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if count > 0 {
		writeError(w, http.StatusForbidden, errors.New("setup already completed"))
		return
	}

	var req setupAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(req.Username) < 3 || len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, errors.New("username must be 3+ chars, password 8+ chars"))
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	user, err := s.users.Create(r.Context(), req.Username, hash, "admin")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	profile, err := s.profiles.Create(r.Context(), user.ID, user.Username, false, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	s.startSession(w, r, user.ID, &profile.ID)
	writeJSON(w, http.StatusCreated, map[string]any{
		"user":            toUserDTO(*user),
		"activeProfileId": profile.ID,
	})
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	user, err := s.users.GetByUsername(r.Context(), req.Username)
	if err != nil || user == nil || !auth.VerifyPassword(user.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, errors.New("invalid username or password"))
		return
	}

	profiles, err := s.profiles.ListByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	var activeProfileID *int64
	if len(profiles) == 1 {
		activeProfileID = &profiles[0].ID
	}

	s.startSession(w, r, user.ID, activeProfileID)

	dtos := make([]profileDTO, len(profiles))
	for i, p := range profiles {
		dtos[i] = toProfileDTO(p)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user":            toUserDTO(*user),
		"profiles":        dtos,
		"activeProfileId": activeProfileID,
	})
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, userID int64, profileID *int64) {
	sessionID, err := auth.GenerateSessionID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	expiresAt := time.Now().Add(sessionTTL)
	if _, err := s.sessions.Create(r.Context(), sessionID, userID, expiresAt); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if profileID != nil {
		_ = s.sessions.SetProfile(r.Context(), sessionID, *profileID)
	}
	s.setSessionCookie(w, sessionID, expiresAt)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(auth.CookieName); err == nil {
		_ = s.sessions.Delete(r.Context(), cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: auth.CookieName, Value: "", Path: "/", MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	sess := auth.SessionFromContext(r.Context())
	if user == nil || sess == nil {
		writeError(w, http.StatusUnauthorized, errors.New("not authenticated"))
		return
	}

	profiles, err := s.profiles.ListByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	dtos := make([]profileDTO, len(profiles))
	for i, p := range profiles {
		dtos[i] = toProfileDTO(p)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user":            toUserDTO(*user),
		"profiles":        dtos,
		"activeProfileId": sess.ProfileID,
	})
}

func (s *Server) handleListProfiles(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())

	profiles, err := s.profiles.ListByUser(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	dtos := make([]profileDTO, len(profiles))
	for i, p := range profiles {
		dtos[i] = toProfileDTO(p)
	}
	writeJSON(w, http.StatusOK, dtos)
}

type createProfileRequest struct {
	DisplayName string `json:"displayName"`
	IsKid       bool   `json:"isKid"`
	Pin         string `json:"pin"`
}

func (s *Server) handleCreateProfile(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())

	var req createProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if req.DisplayName == "" {
		writeError(w, http.StatusBadRequest, errors.New("displayName is required"))
		return
	}
	if req.IsKid && len(req.Pin) < 4 {
		writeError(w, http.StatusBadRequest, errors.New("kid profiles need a PIN of at least 4 digits"))
		return
	}

	var pinHash *string
	if req.IsKid {
		h, err := auth.HashPassword(req.Pin)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		pinHash = &h
	}

	profile, err := s.profiles.Create(r.Context(), user.ID, req.DisplayName, req.IsKid, pinHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, toProfileDTO(*profile))
}

type selectProfileRequest struct {
	Pin string `json:"pin"`
}

func (s *Server) handleSelectProfile(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	sess := auth.SessionFromContext(r.Context())

	profileID, err := strconv.ParseInt(chi.URLParam(r, "profileId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	profile, err := s.profiles.Get(r.Context(), profileID)
	if err != nil || profile == nil || profile.UserID != user.ID {
		writeError(w, http.StatusNotFound, errors.New("profile not found"))
		return
	}

	if profile.IsKid {
		var req selectProfileRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if profile.PinHash == nil || !auth.VerifyPassword(*profile.PinHash, req.Pin) {
			writeError(w, http.StatusForbidden, errors.New("incorrect PIN"))
			return
		}
	}

	if err := s.sessions.SetProfile(r.Context(), sess.ID, profile.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, toProfileDTO(*profile))
}
