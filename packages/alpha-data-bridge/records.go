package main

// This file contains a deliberately small, read-only candidate reader for
// general-record rows whose source messages are observable in the recovered
// message schema. It does not claim to reproduce Alpha's complete records
// database: rows are marked partial and retain source message identity so
// callers can audit each result.

import (
	"context"
	"encoding/xml"
	"io"
	"sort"
	"strconv"
	"strings"
)

const (
	generalPaymentsTable       = "__alpha_general_payments"
	generalFriendRequestsTable = "__alpha_general_friend_requests"
	generalRevokesTable        = "__alpha_general_revokes"
	generalCallsTable          = "__alpha_general_calls"
	maxGeneralRecords          = 20000
	maxRecordXMLBytes          = 256 << 10
	maxRecordTextBytes         = 4096
)

// friendRequestRecord deliberately exposes only the small subset of a
// VerifyMsg/friend payload that can be observed in the message table.  The
// native records database is not available to the independent bridge, so the
// resulting row is always marked partial/candidate and keeps its source
// message identity for auditing.
func friendRequestRecord(tableName, conversation, database, table, sender, localID, serverID string, seconds int64, xmlValue string) (recordEnvelope, bool, error) {
	decoder := xml.NewDecoder(strings.NewReader(xmlValue))
	sysType := ""
	username, nickname, greeting, scene := "", "", "", ""
	inSysMsg := false
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return recordEnvelope{}, false, nil
		}
		switch value := token.(type) {
		case xml.StartElement:
			name := strings.ToLower(value.Name.Local)
			if name == "sysmsg" {
				inSysMsg = true
				for _, attr := range value.Attr {
					if strings.EqualFold(attr.Name.Local, "type") {
						sysType = attr.Value
					}
				}
			}
			if !inSysMsg {
				continue
			}
			if name == "username" || name == "user_name" {
				var textValue string
				if decoder.DecodeElement(&textValue, &value) == nil && username == "" {
					username = strings.TrimSpace(textValue)
				}
			}
			if name == "nickname" || name == "nick_name" {
				var textValue string
				if decoder.DecodeElement(&textValue, &value) == nil && nickname == "" {
					nickname = strings.TrimSpace(textValue)
				}
			}
			if name == "content" || name == "greeting" {
				var textValue string
				if decoder.DecodeElement(&textValue, &value) == nil && greeting == "" {
					greeting = strings.TrimSpace(textValue)
				}
			}
			if name == "scene" {
				var textValue string
				if decoder.DecodeElement(&textValue, &value) == nil && scene == "" {
					scene = strings.TrimSpace(textValue)
				}
			}
		case xml.EndElement:
			if strings.EqualFold(value.Name.Local, "sysmsg") {
				inSysMsg = false
			}
		}
	}
	lowerType := strings.ToLower(strings.TrimSpace(sysType))
	if lowerType != "verifymsg" && lowerType != "friend" && lowerType != "friendmsg" {
		return recordEnvelope{}, false, nil
	}
	if username == "" && nickname == "" && greeting == "" {
		return recordEnvelope{}, false, nil
	}
	eventAt, err := unixMillis(seconds)
	if err != nil {
		return recordEnvelope{}, false, err
	}
	fields := []generalField{
		recordField("kind", "friend_request", false),
		recordField("state", "unknown", false),
		recordField("message_found", "1", false),
	}
	if username != "" {
		fields = append(fields, recordField("person", username, false), recordField("person_name", username, false))
	}
	if nickname != "" {
		fields = append(fields, recordField("person_nickname", nickname, false))
	}
	if greeting != "" {
		fields = append(fields, recordField("greeting", greeting, false))
	}
	if scene != "" {
		fields = append(fields, recordField("scene", scene, false))
	}
	fields = append(fields, generalPersonFields("conversation", conversation)...)
	fields = append(fields, candidateMetadata(database, table, localID, serverID)...)
	return recordEnvelope{item: generalRecord{
		TableName:     tableName,
		ID:            "message:" + database + ":" + table + ":" + localID,
		EventAtUnixMs: eventAt,
		Actor:         sender,
		Content:       "[好友申请候选记录，字段可能不完整]",
		Fields:        fields,
	}, seconds: seconds, database: database, table: table, localID: mustInt64(localID)}, true, nil
}

type paymentXML struct {
	App struct {
		Type      int `xml:"type"`
		WCPayInfo *struct {
			PaySubType        int    `xml:"paysubtype"`
			FeeDesc           string `xml:"feedesc"`
			TranscationID     string `xml:"transcationid"`
			TransferID        string `xml:"transferid"`
			InvalidTime       string `xml:"invalidtime"`
			BeginTransferTime string `xml:"begintransfertime"`
			EffectiveDate     string `xml:"effectivedate"`
			PayMemo           string `xml:"pay_memo"`
			ReceiverUsername  string `xml:"receiver_username"`
			PayerUsername     string `xml:"payer_username"`
		} `xml:"wcpayinfo"`
	} `xml:"appmsg"`
}

type revokeXML struct {
	XMLName   xml.Name `xml:"-"`
	Type      string   `xml:"type,attr"`
	RevokeMsg *struct {
		Content    string `xml:"content"`
		RevokeTime string `xml:"revoketime"`
	} `xml:"revokemsg"`
	SysMsg *struct {
		Type      string `xml:"type,attr"`
		RevokeMsg *struct {
			Content    string `xml:"content"`
			RevokeTime string `xml:"revoketime"`
		} `xml:"revokemsg"`
	} `xml:"sysmsg"`
}

type recordEnvelope struct {
	item     generalRecord
	seconds  int64
	database string
	table    string
	localID  int64
}

func recordField(name, value string, truncated bool) generalField {
	if len(value) > maxRecordTextBytes {
		value = value[:maxRecordTextBytes]
		truncated = true
	}
	return generalField{Name: name, Value: value, ValueKind: 1, Truncated: truncated}
}

func recordMessageXML(content []byte) (string, error) {
	if len(content) == 0 || len(content) > maxRecordXMLBytes {
		return "", fail("GENERAL_RECORD_CONTENT_UNSUPPORTED", "Record message XML is missing or exceeds the bounded size")
	}
	value := strings.TrimSpace(string(content))
	// Group messages can carry a sender prefix before the XML payload.
	if start := strings.Index(value, "<msg"); start >= 0 {
		value = value[start:]
	}
	if !strings.HasPrefix(value, "<msg") && !strings.HasPrefix(value, "<sysmsg") {
		return "", fail("GENERAL_RECORD_CONTENT_UNSUPPORTED", "Record message is not a supported XML payload")
	}
	return value, nil
}

func unixMillis(seconds int64) (string, error) {
	const maxInt64 = int64(^uint64(0) >> 1)
	const minInt64 = -maxInt64 - 1
	if seconds > maxInt64/1000 || seconds < minInt64/1000 {
		return "", fail("GENERAL_RECORD_TIME_INVALID", "Record timestamp exceeds signed millisecond bounds")
	}
	return number(seconds * 1000), nil
}

func generalPersonFields(prefix, username string) []generalField {
	if username == "" {
		return nil
	}
	return []generalField{recordField(prefix, username, false), recordField(prefix+"_name", username, false)}
}

func candidateMetadata(database, table, localID, serverID string) []generalField {
	return []generalField{
		recordField("partial", "1", false),
		recordField("candidate", "1", false),
		recordField("source_database", database, false),
		recordField("source_table", table, false),
		recordField("source_local_id", localID, false),
		recordField("source_server_id", serverID, false),
	}
}

func paymentRecord(tableName, conversation, database, table, sender, localID, serverID string, seconds int64, xmlValue string) (recordEnvelope, bool, error) {
	var parsed paymentXML
	if err := xml.Unmarshal([]byte(xmlValue), &parsed); err != nil {
		return recordEnvelope{}, false, nil
	}
	if parsed.App.Type != 2000 && parsed.App.Type != 2001 && parsed.App.Type != 2003 {
		return recordEnvelope{}, false, nil
	}
	kind := "red_packet"
	if parsed.App.Type == 2000 {
		kind = "transfer"
	}
	info := parsed.App.WCPayInfo
	direction, state := "other", "unknown"
	if info != nil {
		switch info.PaySubType {
		case 1, 7:
			direction, state = "out", "pending"
		case 3, 5:
			direction, state = "in", "received"
		case 4:
			direction, state = "other", "returned"
		}
	}
	fields := []generalField{recordField("kind", kind, false), recordField("direction", direction, false), recordField("state", state, false), recordField("message_found", "1", false)}
	if info != nil {
		fields = append(fields,
			recordField("amount", info.FeeDesc, false),
			recordField("note", info.PayMemo, false),
			recordField("transfer_id", info.TransferID, false),
			recordField("transaction_id", info.TranscationID, false),
			recordField("payer", info.PayerUsername, false),
			recordField("payer_name", info.PayerUsername, false),
			recordField("receiver", info.ReceiverUsername, false),
			recordField("receiver_name", info.ReceiverUsername, false),
		)
		if info.InvalidTime != "" {
			fields = append(fields, recordField("expires_at_unix_ms", info.InvalidTime+"000", false))
		}
		if info.EffectiveDate != "" {
			fields = append(fields, recordField("settled_at_unix_ms", info.EffectiveDate+"000", false))
		}
	}
	fields = append(fields, generalPersonFields("conversation", conversation)...)
	fields = append(fields, candidateMetadata(database, table, localID, serverID)...)
	eventAt, err := unixMillis(seconds)
	if err != nil {
		return recordEnvelope{}, false, err
	}
	return recordEnvelope{item: generalRecord{
		TableName:     tableName,
		ID:            "message:" + database + ":" + table + ":" + localID,
		EventAtUnixMs: eventAt,
		Actor:         sender,
		Content:       "[支付候选记录，字段可能不完整]",
		Fields:        fields,
	}, seconds: seconds, database: database, table: table, localID: mustInt64(localID)}, true, nil
}

func revokeRecord(tableName, conversation, database, table, sender, localID, serverID string, seconds int64, xmlValue string) (recordEnvelope, bool, error) {
	var parsed revokeXML
	if err := xml.Unmarshal([]byte(xmlValue), &parsed); err != nil {
		return recordEnvelope{}, false, nil
	}
	var revoke *struct {
		Content    string `xml:"content"`
		RevokeTime string `xml:"revoketime"`
	}
	typ := parsed.Type
	if parsed.SysMsg != nil {
		typ = parsed.SysMsg.Type
		revoke = parsed.SysMsg.RevokeMsg
	} else {
		revoke = parsed.RevokeMsg
	}
	if typ != "revokemsg" || revoke == nil {
		return recordEnvelope{}, false, nil
	}
	eventAt, err := unixMillis(seconds)
	if err != nil {
		return recordEnvelope{}, false, err
	}
	fields := []generalField{
		recordField("kind", "revoked", false),
		recordField("message_kind", "unknown", false),
		recordField("message_found", "0", false),
		recordField("revoke_content", revoke.Content, false),
	}
	if revoke.RevokeTime != "" {
		fields = append(fields, recordField("message_sent_at_unix_ms", revoke.RevokeTime+"000", false))
	}
	fields = append(fields, generalPersonFields("conversation", conversation)...)
	fields = append(fields, candidateMetadata(database, table, localID, serverID)...)
	return recordEnvelope{item: generalRecord{
		TableName:     tableName,
		ID:            "message:" + database + ":" + table + ":" + localID,
		EventAtUnixMs: eventAt,
		Actor:         sender,
		Content:       "[撤回候选记录，原消息未恢复]",
		Fields:        fields,
	}, seconds: seconds, database: database, table: table, localID: mustInt64(localID)}, true, nil
}

// callRecord intentionally exposes only values that are explicitly present in
// a bounded voip XML payload.  We do not infer call state, direction, or
// duration from local_type=50 alone; the resulting row remains a
// partial/candidate record with its source identity preserved.
func callRecord(tableName, conversation, database, table, sender, localID, serverID string, seconds int64, xmlValue string) (recordEnvelope, bool, error) {
	decoder := xml.NewDecoder(strings.NewReader(xmlValue))
	hasVoIPElement := false
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return recordEnvelope{}, false, nil
		}
		if start, ok := token.(xml.StartElement); ok {
			name := strings.ToLower(start.Name.Local)
			if name == "voipmsg" || name == "voipinvitemsg" {
				hasVoIPElement = true
			}
		}
	}
	if !hasVoIPElement {
		return recordEnvelope{}, false, nil
	}
	fields := []generalField{
		recordField("kind", "call", false),
		recordField("state", "unknown", false),
	}
	// The recovered package proves only that local_type=50 rows with a
	// voipmsg/voipinvitemsg payload are call-shaped. It does not prove the
	// semantics of media, direction, duration, or interruption tags, so those
	// fields stay absent and decode to their protocol defaults.
	fields = append(fields, generalPersonFields("conversation", conversation)...)
	fields = append(fields, candidateMetadata(database, table, localID, serverID)...)
	eventAt, err := unixMillis(seconds)
	if err != nil {
		return recordEnvelope{}, false, err
	}
	return recordEnvelope{item: generalRecord{
		TableName:     tableName,
		ID:            "message:" + database + ":" + table + ":" + localID,
		EventAtUnixMs: eventAt,
		Actor:         sender,
		Content:       "[通话候选记录，字段可能不完整]",
		Fields:        fields,
	}, seconds: seconds, database: database, table: table, localID: mustInt64(localID)}, true, nil
}

func mustInt64(value string) int64 {
	n, _ := strconv.ParseInt(value, 10, 64)
	return n
}

func (b *bridge) generalMessageRecords(ctx context.Context, p params, tableName string) (any, error) {
	if len(b.messageDBs) == 0 {
		return nil, fail("CAPABILITY_UNAVAILABLE", "No message database is present")
	}
	names, err := b.conversationNames(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]recordEnvelope, 0)
	for _, d := range b.messageDBs {
		tables := make([]string, 0)
		for table := range d.tables {
			if messageTableName(table) {
				tables = append(tables, table)
			}
		}
		sort.Strings(tables)
		for _, table := range tables {
			conversation := names[table]
			if conversation == "" {
				// A table hash without a verified Name2Id/contact/session identity
				// cannot be presented as an Alpha record conversation.
				continue
			}
			kind := int64(49)
			if tableName == generalFriendRequestsTable {
				// WeChat's VerifyMsg/friend notifications use local_type 37 in
				// the recovered v4 message schema.  The XML discriminator below
				// remains authoritative; rows with another payload are omitted.
				kind = 37
			} else if tableName == generalRevokesTable {
				kind = 10000
			} else if tableName == generalCallsTable {
				kind = 50
			}
			query := `SELECT m.local_id,m.server_id,m.local_type,m.create_time,CASE WHEN length(CAST(m.message_content AS BLOB))<=262144 THEN m.message_content ELSE NULL END,COALESCE(length(CAST(m.message_content AS BLOB)),0),COALESCE(n.user_name,'') FROM "` + table + `" m LEFT JOIN Name2Id n ON m.real_sender_id=n.rowid WHERE m.local_type=? ORDER BY m.create_time ASC,m.local_id ASC`
			rows, queryErr := d.db.QueryContext(ctx, query, kind)
			if queryErr != nil {
				return nil, fail("QUERY_FAILED", "Cannot query general record message schema")
			}
			for rows.Next() {
				var local, server, kind, seconds int64
				var content, sender string
				var contentSize int64
				if scanErr := rows.Scan(&local, &server, &kind, &seconds, &content, &contentSize, &sender); scanErr != nil {
					rows.Close()
					return nil, fail("ROW_INVALID", "Invalid general record message")
				}
				if contentSize > maxRecordXMLBytes || content == "" {
					// The message is still a candidate by local_type, but its XML
					// cannot be safely decoded. Omit it from the partial view rather
					// than inventing fields or aborting all readable candidates.
					continue
				}
				xmlValue, parseErr := recordMessageXML([]byte(content))
				if parseErr != nil {
					continue
				}
				var candidate recordEnvelope
				var found bool
				var candidateErr error
				if tableName == generalPaymentsTable && kind == 49 {
					candidate, found, candidateErr = paymentRecord(tableName, conversation, d.relative, table, sender, number(local), number(server), seconds, xmlValue)
				} else if tableName == generalFriendRequestsTable && kind == 37 {
					candidate, found, candidateErr = friendRequestRecord(tableName, conversation, d.relative, table, sender, number(local), number(server), seconds, xmlValue)
				} else if tableName == generalRevokesTable && kind == 10000 {
					candidate, found, candidateErr = revokeRecord(tableName, conversation, d.relative, table, sender, number(local), number(server), seconds, xmlValue)
				} else if tableName == generalCallsTable && kind == 50 {
					candidate, found, candidateErr = callRecord(tableName, conversation, d.relative, table, sender, number(local), number(server), seconds, xmlValue)
				}
				if candidateErr != nil {
					rows.Close()
					return nil, candidateErr
				}
				if found {
					result = append(result, candidate)
					if len(result) > maxGeneralRecords {
						rows.Close()
						return nil, fail("GENERAL_RECORDS_LIMIT_EXCEEDED", "General record scan exceeds the bounded limit")
					}
				}
			}
			if rowErr := rows.Err(); rowErr != nil {
				rows.Close()
				return nil, fail("QUERY_FAILED", "General record scan failed")
			}
			rows.Close()
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].seconds != result[j].seconds {
			if p.Ascending != nil && *p.Ascending {
				return result[i].seconds < result[j].seconds
			}
			return result[i].seconds > result[j].seconds
		}
		if result[i].database != result[j].database {
			if p.Ascending != nil && *p.Ascending {
				return result[i].database < result[j].database
			}
			return result[i].database > result[j].database
		}
		if result[i].table != result[j].table {
			if p.Ascending != nil && *p.Ascending {
				return result[i].table < result[j].table
			}
			return result[i].table > result[j].table
		}
		if p.Ascending != nil && *p.Ascending {
			return result[i].localID < result[j].localID
		}
		return result[i].localID > result[j].localID
	})
	start := p.Offset
	if start > len(result) {
		start = len(result)
	}
	end := start + p.Limit
	if end > len(result) {
		end = len(result)
	}
	items := make([]generalRecord, 0, end-start)
	for _, candidate := range result[start:end] {
		items = append(items, candidate.item)
	}
	return generalPage{Items: items, SourceDatabase: "message"}, nil
}

// General record tables that have a verified source in the recovered message
// schema. Unknown tables continue to fail closed in groups.go.
func verifiedGeneralRecordTable(name string) bool {
	return name == generalPaymentsTable || name == generalFriendRequestsTable || name == generalRevokesTable || name == generalCallsTable
}
