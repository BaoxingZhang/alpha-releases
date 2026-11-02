package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestParseMessageDisplayLinkKeepsRawAndDropsUnsafeURL(t *testing.T) {
	content := `<msg><appmsg><type>5</type><title><![CDATA[项目 & Alpha]]></title><des>说明 &amp; 详情</des><url>https://example.test/article</url></appmsg></msg>`
	display := parseMessageDisplay("21474836529", content, "wxid_alpha", "wxid_sender")
	if display == nil || display.Kind != "link" || display.Title != "项目 & Alpha" || display.Description != "说明 & 详情" || display.LinkURL != "https://example.test/article" {
		t.Fatalf("unexpected link display: %#v", display)
	}
	if display.DisplayURL != "" {
		t.Fatalf("path-bearing link must not become an origin display URL: %#v", display)
	}
	unsafe := parseMessageDisplay("21474836529", `<msg><appmsg><type>5</type><title>safe title</title><url>https://example.test/x?cdn_url=secret</url></appmsg></msg>`, "wxid_alpha", "wxid_sender")
	if unsafe == nil || unsafe.LinkURL != "" || unsafe.Title != "safe title" {
		t.Fatalf("unsafe link should remain non-actionable metadata: %#v", unsafe)
	}
}

func TestParseMessageDisplayFileUsesByteTotallenAndUint64Boundary(t *testing.T) {
	content := `<msg><appmsg><type>6</type><title>archive.zip</title><des>压缩包</des><appattach><totallen>9007199254740993</totallen><fileext>zip</fileext></appattach></appmsg></msg>`
	display := parseMessageDisplay("25769803825", content, "wxid_alpha", "wxid_sender")
	if display == nil || display.Kind != "file" || display.FileName != "archive.zip" || display.FileSize != "9007199254740993" || display.FileExtension != "zip" {
		t.Fatalf("unexpected file display: %#v", display)
	}
	tooLarge := parseMessageDisplay("25769803825", `<msg><appmsg><type>6</type><title>x</title><appattach><totallen>18446744073709551616</totallen></appattach></appmsg></msg>`, "wxid_alpha", "wxid_sender")
	if tooLarge == nil || tooLarge.FileSize != "" {
		t.Fatalf("out-of-range byte count should be omitted: %#v", tooLarge)
	}
}

func TestParseMessageDisplayRejectsAmbiguousOrMismatchedXML(t *testing.T) {
	cases := []string{
		`<!DOCTYPE msg><msg><appmsg><type>5</type><title>x</title></appmsg></msg>`,
		`<msg><appmsg><type>5</type><title>a</title><title>b</title></appmsg></msg>`,
		`<msg><appmsg><type>6</type><title>x</title><appattach><totallen><nested>1</nested></totallen></appattach></appmsg></msg>`,
		`<msg><appmsg><type>5</type><title>x</title></appmsg><appmsg><type>5</type></appmsg></msg>`,
	}
	for _, content := range cases {
		if got := parseMessageDisplay("21474836529", content, "wxid_alpha", "wxid_sender"); got != nil {
			t.Fatalf("ambiguous XML should be ignored: %#v from %q", got, content)
		}
	}
	if got := parseMessageDisplay("21474836529", `<msg><appmsg><type>6</type><title>x</title></appmsg></msg>`, "wxid_alpha", "wxid_sender"); got != nil {
		t.Fatalf("packed subtype mismatch must not be misclassified: %#v", got)
	}
}

func TestParseMessageDisplayStripsOnlyVerifiedChatroomSenderPrefix(t *testing.T) {
	withPrefix := parseMessageDisplay("21474836529", "wxid_sender:\n<msg><appmsg><type>5</type><title>x</title></appmsg></msg>", "room@chatroom", "wxid_sender")
	if withPrefix == nil || withPrefix.Title != "x" {
		t.Fatalf("verified chatroom sender prefix should be parseable: %#v", withPrefix)
	}
	withoutPrefix := parseMessageDisplay("21474836529", "wxid_other:\n<msg><appmsg><type>5</type><title>x</title></appmsg></msg>", "room@chatroom", "wxid_sender")
	if withoutPrefix != nil {
		t.Fatalf("unverified sender prefix must not be stripped: %#v", withoutPrefix)
	}
}

func TestParseMessageDisplayLocationUsesBoundedCoordinates(t *testing.T) {
	content := `<msg><location x="39.9042" y="116.4074" label="北京天安门" poiname="天安门" scale="16" /></msg>`
	display := parseMessageDisplay("48", content, "wxid_alpha", "wxid_sender")
	if display == nil || display.Kind != "location" || display.Location == nil {
		t.Fatalf("unexpected location display: %#v", display)
	}
	if display.Location.Latitude != 39.9042 || display.Location.Longitude != 116.4074 || display.Location.Label != "北京天安门" {
		t.Fatalf("unexpected location fields: %#v", display.Location)
	}
	for _, value := range []string{
		`<msg><location x="91" y="116" label="bad" /></msg>`,
		`<msg><location x="39" y="181" label="bad" /></msg>`,
		`<msg><location x="NaN" y="116" label="bad" /></msg>`,
		`<msg><location x="39" y="116"><label>nested</label></location></msg>`,
	} {
		if got := parseMessageDisplay("48", value, "wxid_alpha", "wxid_sender"); got != nil {
			t.Fatalf("invalid location should be ignored: %#v from %q", got, value)
		}
	}
}

func TestParseMessageDisplayQuoteProjectsOnlyShallowReferMetadata(t *testing.T) {
	content := `<msg><appmsg><type>57</type><title>这是引用的文字</title><refermsg><type>1</type><svrid>9007199254740993</svrid><fromusr>wxid_sender</fromusr><chatusr>room@chatroom</chatusr><displayname>群友甲</displayname><content><![CDATA[<msg><img aeskey="secret" /></msg>]]></content></refermsg></appmsg></msg>`
	display := parseMessageDisplay("244813135921", content, "room@chatroom", "wxid_self")
	if display == nil || display.Kind != "quote" || display.Quote == nil {
		t.Fatalf("unexpected quote display: %#v", display)
	}
	quote := display.Quote
	if quote.Sender != "群友甲" || quote.SenderID != "room@chatroom" || quote.Kind != "text" || quote.Text != "这是引用的文字" || quote.ServerID != "9007199254740993" {
		t.Fatalf("unexpected quote fields: %#v", quote)
	}
	encoded, err := json.Marshal(display)
	if err != nil || strings.Contains(string(encoded), "aeskey") {
		t.Fatalf("nested media credentials must not enter quote metadata: %s", encoded)
	}
}

func TestParseMessageDisplayQuoteRejectsAmbiguousOrMismatchedReferMetadata(t *testing.T) {
	cases := []string{
		`<msg><appmsg><type>57</type><title>x</title></appmsg></msg>`,
		`<msg><appmsg><type>57</type><title>x</title><refermsg><displayname>a</displayname><displayname>b</displayname></refermsg></appmsg></msg>`,
		`<msg><appmsg><type>57</type><title>x</title><refermsg><displayname><nested>bad</nested></displayname></refermsg></appmsg></msg>`,
		`<msg><appmsg><type>5</type><title>x</title><refermsg><displayname>a</displayname></refermsg></appmsg></msg>`,
	}
	for _, content := range cases {
		if got := parseMessageDisplay("244813135921", content, "wxid_alpha", "wxid_sender"); got != nil {
			t.Fatalf("ambiguous or mismatched quote XML should be ignored: %#v from %q", got, content)
		}
	}
	control := `<msg><appmsg><type>57</type><title>x</title><refermsg><chatusr>bad&#10;id</chatusr></refermsg></appmsg></msg>`
	if got := parseMessageDisplay("244813135921", control, "wxid_alpha", "wxid_sender"); got == nil || got.Quote == nil || got.Quote.SenderID != "" {
		t.Fatalf("control characters in sender identity must be omitted: %#v", got)
	}
}
