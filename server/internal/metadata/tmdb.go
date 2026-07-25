// Package metadata fetches poster/backdrop artwork and basic details for
// video files from TMDb. It is opt-in: without an API key configured,
// Reelix Core browses and plays everything using bare filenames, exactly
// as before this package existed (see plan §8 — self-hosters can supply
// their own free TMDb key; this stays a convenience, never a hard dependency).
package metadata

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const imageBaseURL = "https://image.tmdb.org/t/p"

// Kind discriminates the two shapes stored in MediaItem.Metadata — a
// plain movie match, or a TV episode (which also carries its parent
// show's identity/artwork so episode tiles/detail pages don't need a
// second lookup).
const (
	KindMovie   = "movie"
	KindEpisode = "episode"
)

type Movie struct {
	Kind         string  `json:"kind"`
	TMDbID       int64   `json:"tmdbId"`
	Title        string  `json:"title"`
	Year         int     `json:"year,omitempty"`
	Overview     string  `json:"overview,omitempty"`
	VoteAverage  float64 `json:"voteAverage,omitempty"`
	PosterPath   string  `json:"posterPath,omitempty"`
	BackdropPath string  `json:"backdropPath,omitempty"`
}

func (m Movie) PosterURL() string {
	if m.PosterPath == "" {
		return ""
	}
	return imageBaseURL + "/w342" + m.PosterPath
}

func (m Movie) BackdropURL() string {
	if m.BackdropPath == "" {
		return ""
	}
	return imageBaseURL + "/w1280" + m.BackdropPath
}

// Episode is a TV episode match, carrying both the episode's own
// artwork/overview and its parent show's — so a browse tile can show a
// still (falling back to the show poster) without a second TMDb call.
type Episode struct {
	Kind             string  `json:"kind"`
	ShowTMDbID       int64   `json:"showTmdbId"`
	ShowTitle        string  `json:"showTitle"`
	ShowOverview     string  `json:"showOverview,omitempty"`
	SeasonNumber     int     `json:"seasonNumber"`
	EpisodeNumber    int     `json:"episodeNumber"`
	Title            string  `json:"title"`
	Overview         string  `json:"overview,omitempty"`
	AirDate          string  `json:"airDate,omitempty"`
	VoteAverage      float64 `json:"voteAverage,omitempty"`
	StillPath        string  `json:"stillPath,omitempty"`
	ShowPosterPath   string  `json:"showPosterPath,omitempty"`
	ShowBackdropPath string  `json:"showBackdropPath,omitempty"`
}

// PosterURL prefers the show's poster — matches how Jellyfin/Netflix
// tile individual episodes with the series' key art, not a still frame.
func (e Episode) PosterURL() string {
	if e.ShowPosterPath == "" {
		return ""
	}
	return imageBaseURL + "/w342" + e.ShowPosterPath
}

func (e Episode) BackdropURL() string {
	path := e.ShowBackdropPath
	if path == "" {
		path = e.StillPath
	}
	if path == "" {
		return ""
	}
	return imageBaseURL + "/w1280" + path
}

func (e Episode) StillURL() string {
	if e.StillPath == "" {
		return ""
	}
	return imageBaseURL + "/w300" + e.StillPath
}

type Client struct {
	apiKey string
	http   *http.Client
}

// NewClient returns nil when apiKey is empty so callers can treat a
// missing key as "metadata lookups disabled" with a single nil check.
func NewClient(apiKey string) *Client {
	if apiKey == "" {
		return nil
	}
	return &Client{apiKey: apiKey, http: &http.Client{Timeout: 10 * time.Second}}
}

type searchResponse struct {
	Results []struct {
		ID           int64   `json:"id"`
		Title        string  `json:"title"`
		Overview     string  `json:"overview"`
		ReleaseDate  string  `json:"release_date"`
		VoteAverage  float64 `json:"vote_average"`
		PosterPath   string  `json:"poster_path"`
		BackdropPath string  `json:"backdrop_path"`
	} `json:"results"`
}

// SearchMovie returns the best-guess TMDb match for a title (and,
// optionally, a release year to disambiguate remakes/sequels), or nil if
// TMDb has nothing for it.
func (c *Client) SearchMovie(ctx context.Context, title string, year int) (*Movie, error) {
	q := url.Values{}
	q.Set("api_key", c.apiKey)
	q.Set("query", title)
	if year > 0 {
		q.Set("year", strconv.Itoa(year))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.themoviedb.org/3/search/movie?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb search: unexpected status %d", resp.StatusCode)
	}

	var parsed searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if len(parsed.Results) == 0 {
		return nil, nil
	}

	best := parsed.Results[0]
	releaseYear := 0
	if len(best.ReleaseDate) >= 4 {
		releaseYear, _ = strconv.Atoi(best.ReleaseDate[:4])
	}
	return &Movie{
		Kind: KindMovie, TMDbID: best.ID, Title: best.Title, Year: releaseYear, Overview: best.Overview,
		VoteAverage: best.VoteAverage, PosterPath: best.PosterPath, BackdropPath: best.BackdropPath,
	}, nil
}

type tvSearchResponse struct {
	Results []struct {
		ID           int64  `json:"id"`
		Name         string `json:"name"`
		Overview     string `json:"overview"`
		PosterPath   string `json:"poster_path"`
		BackdropPath string `json:"backdrop_path"`
	} `json:"results"`
}

type tvShow struct {
	ID           int64
	Name         string
	Overview     string
	PosterPath   string
	BackdropPath string
}

// searchTVShow returns the best-guess TMDb show id/artwork for a title,
// or nil if TMDb has nothing for it.
func (c *Client) searchTVShow(ctx context.Context, title string) (*tvShow, error) {
	q := url.Values{}
	q.Set("api_key", c.apiKey)
	q.Set("query", title)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.themoviedb.org/3/search/tv?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb tv search: unexpected status %d", resp.StatusCode)
	}

	var parsed tvSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	if len(parsed.Results) == 0 {
		return nil, nil
	}
	best := parsed.Results[0]
	return &tvShow{ID: best.ID, Name: best.Name, Overview: best.Overview, PosterPath: best.PosterPath, BackdropPath: best.BackdropPath}, nil
}

type episodeResponse struct {
	Name          string  `json:"name"`
	Overview      string  `json:"overview"`
	AirDate       string  `json:"air_date"`
	VoteAverage   float64 `json:"vote_average"`
	StillPath     string  `json:"still_path"`
	SeasonNumber  int     `json:"season_number"`
	EpisodeNumber int     `json:"episode_number"`
}

// SearchEpisode looks up a show by title, then fetches the given
// season/episode's details — two TMDb calls, since TMDb has no combined
// "search by show name + SxxExx" endpoint. Returns nil (not an error) if
// the show or that specific episode isn't found.
func (c *Client) SearchEpisode(ctx context.Context, showTitle string, season, episode int) (*Episode, error) {
	show, err := c.searchTVShow(ctx, showTitle)
	if err != nil {
		return nil, err
	}
	if show == nil {
		return nil, nil
	}

	episodeURL := fmt.Sprintf("https://api.themoviedb.org/3/tv/%d/season/%d/episode/%d?api_key=%s", show.ID, season, episode, c.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, episodeURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tmdb episode lookup: unexpected status %d", resp.StatusCode)
	}

	var parsed episodeResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	return &Episode{
		Kind: KindEpisode, ShowTMDbID: show.ID, ShowTitle: show.Name, ShowOverview: show.Overview,
		SeasonNumber: season, EpisodeNumber: episode, Title: parsed.Name, Overview: parsed.Overview,
		AirDate: parsed.AirDate, VoteAverage: parsed.VoteAverage, StillPath: parsed.StillPath,
		ShowPosterPath: show.PosterPath, ShowBackdropPath: show.BackdropPath,
	}, nil
}

var yearInParens = regexp.MustCompile(`\((\d{4})\)`)

// TitleAndYear derives a search query from a filename like the common
// "Movie Title (2019).mkv" / "Movie.Title.2019.1080p.mkv" scene-release
// conventions — good enough to drive a TMDb search, not meant to be exact.
var bareYear = regexp.MustCompile(`\b(19\d{2}|20\d{2})\b`)

func TitleAndYear(filenameWithoutExt string) (title string, year int) {
	name := filenameWithoutExt

	if m := yearInParens.FindStringSubmatch(name); m != nil {
		year, _ = strconv.Atoi(m[1])
		name = name[:strings.Index(name, m[0])]
	} else {
		// Normalize scene-release separators to spaces first so \b can
		// actually see a boundary around a "_2021"/"2021." style year.
		normalized := strings.ReplaceAll(strings.ReplaceAll(name, ".", " "), "_", " ")
		if m := bareYear.FindStringSubmatchIndex(normalized); m != nil {
			year, _ = strconv.Atoi(normalized[m[2]:m[3]])
			name = normalized[:m[0]]
		}
	}

	name = strings.ReplaceAll(name, ".", " ")
	name = strings.ReplaceAll(name, "_", " ")
	return strings.TrimSpace(name), year
}

var episodeMarker = regexp.MustCompile(`(?i)[Ss](\d{1,2})[Ee](\d{1,3})`)

// ParseEpisode detects the common "S01E06" scene-release marker in a
// filename. titleHint (typically the show's folder name) is preferred
// for the show title when given, since a filename prefix is often just
// the release-group's abbreviation rather than the actual show name;
// it falls back to whatever precedes the marker in the filename itself.
func ParseEpisode(filenameWithoutExt, titleHint string) (showTitle string, season, episode int, ok bool) {
	m := episodeMarker.FindStringSubmatchIndex(filenameWithoutExt)
	if m == nil {
		return "", 0, 0, false
	}
	season, _ = strconv.Atoi(filenameWithoutExt[m[2]:m[3]])
	episode, _ = strconv.Atoi(filenameWithoutExt[m[4]:m[5]])

	showTitle = strings.TrimSpace(titleHint)
	if showTitle == "" {
		prefix := filenameWithoutExt[:m[0]]
		prefix = strings.ReplaceAll(strings.ReplaceAll(prefix, ".", " "), "_", " ")
		showTitle = strings.TrimSpace(prefix)
	}
	if showTitle == "" {
		return "", 0, 0, false
	}
	return showTitle, season, episode, true
}
