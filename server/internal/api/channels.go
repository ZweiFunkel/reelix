package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func (s *Server) handleGetChannel(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "channelId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	channel, err := s.channels.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("channel not found"))
		return
	}

	dtos := s.attachProgress(r.Context(), []mediaItemDTO{toChannelDTO(*channel)})
	writeJSON(w, http.StatusOK, dtos[0])
}

// handleStreamChannel redirects to the channel's external stream URL —
// IPTV sources are already-compatible live streams, so there is nothing
// to transcode or Range-serve locally. No CORS proxying in v1: browser
// playback works when the source allows cross-origin requests, same
// caveat most lightweight IPTV players have.
func (s *Server) handleStreamChannel(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "channelId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	channel, err := s.channels.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusNotFound, errors.New("channel not found"))
		return
	}

	http.Redirect(w, r, channel.StreamURL, http.StatusFound)
}
