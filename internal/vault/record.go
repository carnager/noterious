package vault

import (
	"errors"
	"time"
)

const ConfiguredVaultID int64 = 0

var ErrVaultNotFound = errors.New("vault not found")
var ErrVaultAlreadyExists = errors.New("vault already exists")
var ErrVaultNameRequired = errors.New("vault name is required")
var ErrInvalidVaultName = errors.New("invalid vault name")
var ErrVaultRootRequired = errors.New("vault root is required")
var ErrInvalidFolderPath = errors.New("invalid folder path")
var ErrInvalidTargetFolderPath = errors.New("invalid target folder path")
var ErrInvalidTargetFolderName = errors.New("invalid target folder name")
var ErrInvalidFolderMove = errors.New("invalid folder move")
var ErrFolderAlreadyExists = errors.New("folder already exists")

type Vault struct {
	ID        int64     `json:"id"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	VaultPath string    `json:"vaultPath"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
