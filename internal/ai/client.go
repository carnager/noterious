package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAICompatibleClient struct {
	httpClient *http.Client
}

func newOpenAICompatibleClient() *openAICompatibleClient {
	return &openAICompatibleClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *openAICompatibleClient) complete(ctx context.Context, baseURL string, model string, apiKey string, messages []chatMessage) (string, error) {
	endpoint := buildChatCompletionsEndpoint(baseURL)
	body, err := json.Marshal(map[string]any{
		"model":    strings.TrimSpace(model),
		"messages": messages,
	})
	if err != nil {
		return "", fmt.Errorf("encode ai request: %w", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("build ai request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(apiKey) != "" {
		request.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	}

	response, err := c.httpClient.Do(request)
	if err != nil {
		return "", fmt.Errorf("send ai request: %w", err)
	}
	defer response.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return "", fmt.Errorf("read ai response: %w", err)
	}

	if response.StatusCode >= http.StatusBadRequest {
		var payload struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(raw, &payload); err == nil && strings.TrimSpace(payload.Error.Message) != "" {
			return "", fmt.Errorf("ai provider error: %s", payload.Error.Message)
		}
		return "", fmt.Errorf("ai provider error: %s", strings.TrimSpace(string(raw)))
	}

	var payload struct {
		Choices []struct {
			Message struct {
				Content any `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", fmt.Errorf("decode ai response: %w", err)
	}
	if len(payload.Choices) == 0 {
		return "", fmt.Errorf("ai provider returned no choices")
	}

	text := extractContentText(payload.Choices[0].Message.Content)
	if text == "" {
		return "", fmt.Errorf("ai provider returned empty content")
	}
	return text, nil
}

func buildChatCompletionsEndpoint(baseURL string) string {
	trimmed := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if strings.HasSuffix(trimmed, "/chat/completions") {
		return trimmed
	}
	return trimmed + "/chat/completions"
}

func extractContentText(content any) string {
	switch typed := content.(type) {
	case string:
		return strings.TrimSpace(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if object, ok := item.(map[string]any); ok {
				if text, ok := object["text"].(string); ok && strings.TrimSpace(text) != "" {
					parts = append(parts, strings.TrimSpace(text))
				}
			}
		}
		return strings.TrimSpace(strings.Join(parts, "\n"))
	default:
		return ""
	}
}
