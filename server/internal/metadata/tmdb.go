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

type Movie struct {
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
		TMDbID: best.ID, Title: best.Title, Year: releaseYear, Overview: best.Overview,
		VoteAverage: best.VoteAverage, PosterPath: best.PosterPath, BackdropPath: best.BackdropPath,
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
