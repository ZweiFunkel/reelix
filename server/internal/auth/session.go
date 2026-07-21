package auth

import (
	"crypto/rand"
	"encoding/base64"
)

// GenerateSessionID returns a 256-bit random, URL-safe token used as both
// the session table's primary key and the cookie value.
func GenerateSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
