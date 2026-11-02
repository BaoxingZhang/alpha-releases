package main

import (
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf16"
)

// messageDisplay is the small, transport-safe subset of message XML that the
// recovered desktop already knows how to validate and render. The original XML
// remains in message.Content; this object only adds display metadata and never
// supplies a local file path or a download token.
type messageDisplay struct {
	Kind          string           `json:"kind"`
	Title         string           `json:"title,omitempty"`
	Description   string           `json:"description,omitempty"`
	SourceName    string           `json:"sourceName,omitempty"`
	FileName      string           `json:"fileName,omitempty"`
	FileSize      string           `json:"fileSize,omitempty"`
	FileExtension string           `json:"fileExtension,omitempty"`
	DisplayURL    string           `json:"displayUrl,omitempty"`
	LinkURL       string           `json:"linkUrl,omitempty"`
	Location      *messageLocation `json:"location,omitempty"`
	Quote         *messageQuote    `json:"quote,omitempty"`
}

type messageLocation struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Label     string  `json:"label"`
}

// messageQuote is intentionally a shallow projection.  The referenced
// message's XML may contain media credentials or another nested message; it
// stays in the original content and is never copied into display metadata.
type messageQuote struct {
	Sender   string `json:"sender"`
	Kind     string `json:"kind"`
	Text     string `json:"text"`
	SenderID string `json:"senderId,omitempty"`
	ServerID string `json:"serverId,omitempty"`
}

const messageDisplayXMLLimit = 64 * 1024
const messageDisplayMaxDepth = 32
const messageDisplayMaxNodes = 512
const messageDisplayMaxText = 2048

var messageDisplayExtension = regexp.MustCompile(`^[A-Za-z0-9]{1,12}$`)
var messageDisplayDigits = regexp.MustCompile(`^[0-9]{1,20}$`)

type displayXMLNode struct {
	name     string
	attrs    map[string]string
	text     strings.Builder
	children []*displayXMLNode
}

// parseMessageDisplay reads only the bounded appmsg fields used by the
// existing main-process validator. encoding/xml in Strict mode handles XML
// entities and CDATA while keeping malformed/ambiguous structures out.
func parseMessageDisplay(localType, content, conversationID, sender string) *messageDisplay {
	local, err := strconv.ParseInt(localType, 10, 64)
	if err != nil || local < 0 {
		return nil
	}
	messageType := uint64(local) & 0xffffffff
	if messageType != 48 && messageType != 49 {
		return nil
	}
	rootType := uint64(local) >> 32
	payload := content
	if strings.HasSuffix(conversationID, "@chatroom") && sender != "" {
		for _, prefix := range []string{sender + ":\r\n", sender + ":\n"} {
			if strings.HasPrefix(payload, prefix) {
				payload = payload[len(prefix):]
				break
			}
		}
	}
	root, ok := parseDisplayXML([]byte(payload))
	if !ok || root.name != "msg" {
		return nil
	}
	if messageType == 48 {
		return parseLocationDisplay(root)
	}
	appmsgs := directDisplayChildren(root, "appmsg")
	if len(appmsgs) != 1 {
		return nil
	}
	app := appmsgs[0]
	typeNode, ok := uniqueDisplayChild(app, "type")
	if !ok || len(typeNode.children) != 0 {
		return nil
	}
	typeValue, err := strconv.ParseInt(strings.TrimSpace(typeNode.text.String()), 10, 64)
	if err != nil || typeValue < 0 || (rootType != 0 && uint64(typeValue) != rootType) {
		return nil
	}
	if typeValue != 5 && typeValue != 6 && typeValue != 57 {
		return nil
	}
	for _, name := range []string{"title", "des", "sourcedisplayname", "url"} {
		if len(directDisplayChildren(app, name)) > 1 {
			return nil
		}
		if node, found := uniqueDisplayChild(app, name); found && len(node.children) != 0 {
			return nil
		}
	}
	if _, found := uniqueDisplayChild(app, "appattach"); found && typeValue == 5 {
		// Link messages do not carry file attachments in the recovered schema.
		return nil
	} else if len(directDisplayChildren(app, "appattach")) > 1 {
		return nil
	}
	if typeValue == 57 && len(directDisplayChildren(app, "refermsg")) != 1 {
		return nil
	}

	display := &messageDisplay{Kind: map[int64]string{5: "link", 6: "file", 57: "quote"}[typeValue]}
	setDisplayText := func(name string, dst *string) {
		node, found := uniqueDisplayChild(app, name)
		if !found || len(node.children) != 0 {
			return
		}
		value, valid := displayText(node.text.String())
		if !valid {
			return
		}
		*dst = value
	}
	// An overlong known field is omitted as metadata. It cannot make raw
	// content disappear, and it cannot be used to bypass the main validator.
	if typeValue != 57 {
		setDisplayText("title", &display.Title)
		setDisplayText("des", &display.Description)
		setDisplayText("sourcedisplayname", &display.SourceName)
	}

	if typeValue == 5 {
		if node, found := uniqueDisplayChild(app, "url"); found {
			if value, valid := displayLinkURL(strings.TrimSpace(node.text.String())); valid {
				display.LinkURL = value
				if origin, ok := displayOrigin(value); ok {
					display.DisplayURL = origin
				}
			}
		}
	} else if typeValue == 6 {
		if attach, found := uniqueDisplayChild(app, "appattach"); found {
			// appattach with scalar fields is expected; a nested attach is
			// ambiguous and is therefore omitted rather than guessed.
			for _, name := range []string{"totallen", "fileext"} {
				if len(directDisplayChildren(attach, name)) > 1 {
					return nil
				}
				if node, ok := uniqueDisplayChild(attach, name); ok && len(node.children) != 0 {
					return nil
				}
			}
			if node, ok := uniqueDisplayChild(attach, "totallen"); ok {
				if value, valid := displayFileSize(strings.TrimSpace(node.text.String())); valid {
					display.FileSize = value
				}
			}
			if node, ok := uniqueDisplayChild(attach, "fileext"); ok {
				if value, valid := displayText(strings.TrimSpace(node.text.String())); valid && messageDisplayExtension.MatchString(value) {
					display.FileExtension = value
				}
			}
		}
	} else if typeValue == 57 {
		display.Quote = parseQuoteDisplay(app)
		if display.Quote == nil {
			return nil
		}
	}
	if typeValue == 6 && display.Title != "" {
		display.FileName = display.Title
		display.Title = ""
	}
	if display.Title == "" && display.Description == "" && display.SourceName == "" && display.FileName == "" && display.FileSize == "" && display.FileExtension == "" && display.LinkURL == "" && display.Quote == nil {
		return nil
	}
	return display
}

func parseQuoteDisplay(app *displayXMLNode) *messageQuote {
	refer, found := uniqueDisplayChild(app, "refermsg")
	if !found {
		return nil
	}
	// Only scalar identity fields are projected.  In particular, refermsg
	// content is deliberately ignored because it can contain nested XML,
	// media tokens, or credentials that are outside this display contract.
	for _, name := range []string{"type", "svrid", "fromusr", "chatusr", "displayname"} {
		if len(directDisplayChildren(refer, name)) > 1 {
			return nil
		}
		if node, ok := uniqueDisplayChild(refer, name); ok && len(node.children) != 0 {
			return nil
		}
	}
	textNode := func(parent *displayXMLNode, name string, limit int) string {
		node, ok := uniqueDisplayChild(parent, name)
		if !ok || len(node.children) != 0 {
			return ""
		}
		value, valid := displayTextLimit(node.text.String(), limit)
		if !valid {
			return ""
		}
		return value
	}
	quotedText := textNode(app, "title", messageDisplayMaxText)
	displayName := textNode(refer, "displayname", messageDisplayMaxText)
	senderID := textNode(refer, "chatusr", 512)
	if senderID == "" {
		senderID = textNode(refer, "fromusr", 512)
	}
	if strings.IndexFunc(senderID, func(r rune) bool { return r < 0x20 || r == 0x7f }) >= 0 {
		senderID = ""
	}
	sender := displayName
	if sender == "" {
		sender = senderID
	}
	if sender == "" && quotedText == "" {
		return nil
	}
	kind := "text"
	if typeText := textNode(refer, "type", 20); typeText != "" {
		if parsed, err := strconv.ParseInt(typeText, 10, 64); err == nil && parsed >= 0 {
			kind = quotedMessageKind(parsed)
		}
	}
	serverID := textNode(refer, "svrid", 20)
	if serverID != "" && !messageDisplayDigits.MatchString(serverID) {
		serverID = ""
	}
	return &messageQuote{Sender: sender, Kind: kind, Text: quotedText, SenderID: senderID, ServerID: serverID}
}

func quotedMessageKind(value int64) string {
	switch value {
	case 1:
		return "text"
	case 3:
		return "image"
	case 34:
		return "voice"
	case 42:
		return "contact"
	case 43:
		return "video"
	case 47:
		return "sticker"
	case 48:
		return "location"
	case 49:
		return "link"
	case 50:
		return "call"
	case 10000, 10002:
		return "system"
	default:
		return "other"
	}
}

// parseLocationDisplay accepts the standard WeChat <msg><location x="..."
// y="..." label="..."/></msg> shape. Coordinates are only exposed when both
// required attributes parse as finite values in their geographic ranges. The
// raw XML remains authoritative when the schema is incomplete or ambiguous.
func parseLocationDisplay(root *displayXMLNode) *messageDisplay {
	locations := directDisplayChildren(root, "location")
	if len(locations) != 1 || len(directDisplayChildren(root, "appmsg")) != 0 {
		return nil
	}
	location := locations[0]
	if len(location.children) != 0 {
		return nil
	}
	latitude, ok := displayCoordinate(location.attrs["x"], 90)
	if !ok {
		return nil
	}
	longitude, ok := displayCoordinate(location.attrs["y"], 180)
	if !ok {
		return nil
	}
	label := strings.TrimSpace(location.attrs["label"])
	if len(utf16.Encode([]rune(label))) > messageDisplayMaxText || strings.IndexByte(label, 0) >= 0 {
		return nil
	}
	return &messageDisplay{Kind: "location", Location: &messageLocation{Latitude: latitude, Longitude: longitude, Label: label}}
}

func displayCoordinate(value string, limit float64) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 64 || strings.IndexByte(value, 0) >= 0 {
		return 0, false
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) || parsed < -limit || parsed > limit {
		return 0, false
	}
	return parsed, true
}

func parseDisplayXML(input []byte) (*displayXMLNode, bool) {
	if len(input) == 0 || len(input) > messageDisplayXMLLimit {
		return nil, false
	}
	decoder := xml.NewDecoder(bytes.NewReader(input))
	decoder.Strict = true
	var root *displayXMLNode
	stack := make([]*displayXMLNode, 0, 8)
	nodes := 0
	for {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, false
		}
		switch value := token.(type) {
		case xml.StartElement:
			if value.Name.Space != "" || value.Name.Local == "" || len(stack) >= messageDisplayMaxDepth || nodes >= messageDisplayMaxNodes {
				return nil, false
			}
			attrs := make(map[string]string, len(value.Attr))
			for _, attr := range value.Attr {
				// Namespaced attributes are irrelevant to the recovered scalar
				// fields (and common on real AppMsg XML); ignore them while
				// retaining strict values for unqualified attributes we consume.
				if attr.Name.Space != "" {
					continue
				}
				if attr.Name.Local == "" || strings.IndexByte(attr.Value, 0) >= 0 {
					return nil, false
				}
				if _, exists := attrs[attr.Name.Local]; exists {
					return nil, false
				}
				attrs[attr.Name.Local] = attr.Value
			}
			node := &displayXMLNode{name: value.Name.Local, attrs: attrs}
			if len(stack) == 0 {
				if root != nil {
					return nil, false
				}
				root = node
			} else {
				stack[len(stack)-1].children = append(stack[len(stack)-1].children, node)
			}
			stack = append(stack, node)
			nodes++
		case xml.EndElement:
			if len(stack) == 0 || stack[len(stack)-1].name != value.Name.Local || value.Name.Space != "" {
				return nil, false
			}
			stack = stack[:len(stack)-1]
		case xml.CharData:
			if len(stack) == 0 {
				if strings.TrimSpace(string(value)) != "" {
					return nil, false
				}
				continue
			}
			if stack[len(stack)-1].text.Len()+len(value) > messageDisplayXMLLimit {
				return nil, false
			}
			stack[len(stack)-1].text.Write([]byte(value))
		case xml.Comment:
			// Comments do not contribute to scalar values and are safe to ignore.
		case xml.Directive:
			return nil, false
		case xml.ProcInst:
			if !strings.EqualFold(value.Target, "xml") || root != nil || len(stack) != 0 {
				return nil, false
			}
		}
	}
	if root == nil || len(stack) != 0 {
		return nil, false
	}
	return root, true
}

func directDisplayChildren(node *displayXMLNode, name string) []*displayXMLNode {
	children := make([]*displayXMLNode, 0, 1)
	for _, child := range node.children {
		if child.name == name {
			children = append(children, child)
		}
	}
	return children
}

func uniqueDisplayChild(node *displayXMLNode, name string) (*displayXMLNode, bool) {
	children := directDisplayChildren(node, name)
	if len(children) != 1 {
		return nil, false
	}
	return children[0], true
}

func displayText(value string) (string, bool) {
	return displayTextLimit(value, messageDisplayMaxText)
}

func displayTextLimit(value string, limit int) (string, bool) {
	value = strings.TrimSpace(value)
	if strings.IndexByte(value, 0) >= 0 || len(utf16.Encode([]rune(value))) > limit {
		return "", false
	}
	return value, value != ""
}

func displayFileSize(value string) (string, bool) {
	if !messageDisplayDigits.MatchString(value) {
		return "", false
	}
	n, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return "", false
	}
	return strconv.FormatUint(n, 10), true
}

func displayLinkURL(value string) (string, bool) {
	if value == "" || len(value) > 4096 || strings.ContainsAny(value, "\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b\x0c\x0d\x0e\x0f\x10\x11\x12\x13\x14\x15\x16\x17\x18\x19\x1a\x1b\x1c\x1d\x1e\x1f ") {
		return "", false
	}
	parsed, err := url.Parse(value)
	if err != nil || !strings.EqualFold(parsed.Scheme, "https") || parsed.Host == "" || parsed.User != nil {
		return "", false
	}
	for key := range parsed.Query() {
		if strings.EqualFold(key, "aes_key") || strings.EqualFold(key, "aeskey") || strings.EqualFold(key, "cdn_url") || strings.EqualFold(key, "cdnurl") || strings.EqualFold(key, "encrypt_url") || strings.EqualFold(key, "encrypturl") {
			return "", false
		}
	}
	return value, true
}

func displayOrigin(value string) (string, bool) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || parsed.Path != "" && parsed.Path != "/" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		return "", false
	}
	return parsed.Scheme + "://" + parsed.Host, true
}
