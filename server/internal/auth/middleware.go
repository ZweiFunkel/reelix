package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/novex-labs/reelix/server/internal/db"
)

// CookieName is the session cookie set on login/setup and read by every
// authenticated request coming from a browser.
const CookieName = "reelix_session"

// SessionIDFromRequest returns the session id a request is authenticating
// with, from any of three transports: the cookie (browsers, same-origin),
// an Authorization: Bearer header, or a ?token= query parameter.
//
// The header exists because the cookie fundamentally cannot work for the
// desktop/mobile shells: they load the frontend from their own origin
// (http://tauri.localhost, capacitor://localhost) and call a
// user-configured server, so every request is cross-site. A cross-site
// cookie needs SameSite=None, which browsers only honour together with
// Secure — i.e. HTTPS, which a self-hosted server on a LAN IP typically
// doesn't have. Same session id, same store, just carried in a header
// that no such rule applies to.
//
// The query parameter exists for the same reason on top of that: a plain
// <video>/<img> element has no way to attach a custom header to the
// request it makes for its own src, so stream/thumbnail URLs built for
// those elements carry the token in the URL instead — see mediaUrl() in
// the frontend's api.ts.
func SessionIDFromRequest(r *http.Request) string {
	if header := r.Header.Get("Authorization"); header != "" {
		if token, ok := strings.CutPrefix(header, "Bearer "); ok {
			return strings.TrimSpace(token)
		}
	}
	if token := r.URL.Query().Get("token"); token != "" {
		return token
	}
	if cookie, err := r.Cookie(CookieName); err == nil {
		return cookie.Value
	}
	return ""
}

type contextKey string

const (
	userContextKey    contextKey = "reelix_user"
	sessionContextKey contextKey = "reelix_session_obj"
)

type Middleware struct {
	sessions *db.SessionStore
	users    *db.UserStore
	profiles *db.ProfileStore
}

func NewMiddleware(sessions *db.SessionStore, users *db.UserStore, profiles *db.ProfileStore) *Middleware {
	return &Middleware{sessions: sessions, users: users, profiles: profiles}
}

func (m *Middleware) sessionFromRequest(r *http.Request) (*db.Session, *db.User) {
	sessionID := SessionIDFromRequest(r)
	if sessionID == "" {
		return nil, nil
	}
	sess, err := m.sessions.Get(r.Context(), sessionID)
	if err != nil || sess == nil {
		return nil, nil
	}
	user, err := m.users.Get(r.Context(), sess.UserID)
	if err != nil || user == nil {
		return nil, nil
	}
	_ = m.sessions.Touch(r.Context(), sess.ID)
	return sess, user
}

// RequireAuth rejects requests without a valid session, but does not
// require an active profile — used for endpoints like "list my profiles"
// that must work before one is picked.
func (m *Middleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, user := m.sessionFromRequest(r)
		if sess == nil {
			http.Error(w, `{"error":"authentication required"}`, http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey, user)
		ctx = context.WithValue(ctx, sessionContextKey, sess)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAdmin additionally rejects non-admin accounts, AND — since a kid
// profile lives under its parent's account and would otherwise inherit
// that account's admin role — rejects sessions currently on a kid profile
// even if the underlying account is an admin. Admin server-management
// access is about who's holding the device, and a "who's watching" pick
// of a kid profile means it isn't the admin right now.
func (m *Middleware) RequireAdmin(next http.Handler) http.Handler {
	return m.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil || user.Role != "admin" {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}
		if sess := SessionFromContext(r.Context()); sess != nil && sess.ProfileID != nil {
			if profile, err := m.profiles.Get(r.Context(), *sess.ProfileID); err == nil && profile != nil && profile.IsKid {
				http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	}))
}

// RequireProfile additionally requires a profile to have been selected for
// this session (the "who's watching" step) — gates browsing/playback so
// watch state always has somewhere to attach to.
func (m *Middleware) RequireProfile(next http.Handler) http.Handler {
	return m.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if sess := SessionFromContext(r.Context()); sess == nil || sess.ProfileID == nil {
			http.Error(w, `{"error":"select a profile first"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func UserFromContext(ctx context.Context) *db.User {
	u, _ := ctx.Value(userContextKey).(*db.User)
	return u
}

func SessionFromContext(ctx context.Context) *db.Session {
	s, _ := ctx.Value(sessionContextKey).(*db.Session)
	return s
}
