package main

import "testing"

func TestFriendRequestRecordRequiresVerifyDiscriminator(t *testing.T) {
	xmlValue := `<msg><sysmsg type="VerifyMsg"><username>wxid_beta</username><nickname>Beta</nickname><content>请添加我</content><scene>33</scene></sysmsg></msg>`
	row, found, err := friendRequestRecord(generalFriendRequestsTable, "wxid_beta", "message/message_1.db", "Msg_deadbeefdeadbeefdeadbeefdeadbeef", "wxid_self", "7", "123", 1700000000, xmlValue)
	if err != nil || !found {
		t.Fatalf("expected friend request candidate, found=%v err=%v", found, err)
	}
	if row.item.TableName != generalFriendRequestsTable || row.item.EventAtUnixMs != "1700000000000" {
		t.Fatalf("unexpected record identity/time: %#v", row.item)
	}
	fields := map[string]string{}
	for _, field := range row.item.Fields {
		fields[field.Name] = field.Value
	}
	if fields["person"] != "wxid_beta" || fields["person_nickname"] != "Beta" || fields["greeting"] != "请添加我" || fields["scene"] != "33" {
		t.Fatalf("unexpected fields: %#v", fields)
	}
	if fields["partial"] != "1" || fields["candidate"] != "1" {
		t.Fatalf("candidate markers missing: %#v", fields)
	}
	_, found, err = friendRequestRecord(generalFriendRequestsTable, "wxid_beta", "db", "table", "", "1", "1", 1, `<msg><sysmsg type="status"><text>not a friend request</text></sysmsg></msg>`)
	if err != nil || found {
		t.Fatalf("non-VerifyMsg payload must be ignored, found=%v err=%v", found, err)
	}
}
