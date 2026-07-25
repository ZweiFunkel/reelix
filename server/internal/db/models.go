package db

import "time"

type Library struct {
	ID             int64
	Name           string
	RootPath       string
	Type           string // FOLDER | PHOTO | M3U
	ScanSettings   string // json
	ScanGeneration int64
	LastScannedAt  *time.Time
	CreatedAt      time.Time
}

type Category struct {
	ID                 int64
	LibraryID          int64
	ParentCategoryID   *int64
	Name               string
	Path               string
	SortOrder          int
	LastSeenGeneration int64
}

type MediaItem struct {
	ID                 int64
	LibraryID          int64
	CategoryID         *int64
	FilePath           string
	FileSize           int64
	FileMTime          time.Time
	MediaType          string
	DurationSeconds    *float64
	CodecInfo          *string
	Metadata           string // json
	LastSeenGeneration int64
	DeletedAt          *time.Time
	CreatedAt          time.Time
}

type Channel struct {
	ID                 int64
	LibraryID          int64
	CategoryID         *int64
	Name               string
	GroupTitle         string
	StreamURL          string
	TVGID              string
	TVGLogo            string
	SortOrder          int
	LastSeenGeneration int64
	DeletedAt          *time.Time
}

type User struct {
	ID            int64
	Username      string
	PasswordHash  string
	Role          string // admin | user
	Email         *string
	EmailVerified bool
	CreatedAt     time.Time
}

// TokenPurpose distinguishes what a password_reset_token row is for —
// the same code/expiry/used-once shape serves both flows.
const (
	TokenPurposePasswordReset = "password_reset"
	TokenPurposeEmailVerify   = "email_verify"
)

type PasswordResetToken struct {
	ID        int64
	UserID    int64
	Code      string
	Purpose   string
	ExpiresAt time.Time
	Used      bool
}

type Profile struct {
	ID          int64
	UserID      int64
	DisplayName string
	Avatar      *string
	IsKid       bool
	PinHash     *string
}

type Session struct {
	ID         string
	UserID     int64
	ProfileID  *int64
	ExpiresAt  time.Time
	CreatedAt  time.Time
	LastSeenAt *time.Time
}

// SMTPSettings is the admin-configurable outgoing-mail config — set via
// the admin UI, taking precedence over the REELIX_SMTP_* env vars when
// present (see mail.Sender). Host empty means "not configured".
type SMTPSettings struct {
	Host        string
	Port        int
	Username    string
	Password    string
	FromAddress string
}

type WatchState struct {
	ProfileID        int64
	PlayableItemID   int64
	PlayableItemType string // media_item | channel
	PositionSeconds  float64
	DurationSeconds  *float64
	Watched          bool
	UpdatedAt        time.Time
}
