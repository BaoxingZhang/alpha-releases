/*
 * Test-only SQLite preparation helper.  It uses the public SQLite
 * SQLITE_FCNTL_RESERVE_BYTES opcode instead of guessing the header field.
 * The helper never opens a user supplied path from the application; the JS
 * fixture creates a disposable synthetic directory and passes each database
 * explicitly.
 */
#include <sqlite3.h>
#include <stdio.h>

int main(int argc, char **argv) {
  if (argc != 2) {
    fputs("usage: encrypted-fixture-native DATABASE\n", stderr);
    return 2;
  }
  sqlite3 *db = NULL;
  int rc = sqlite3_open_v2(argv[1], &db, SQLITE_OPEN_READWRITE, NULL);
  if (rc != SQLITE_OK) {
    fprintf(stderr, "sqlite open failed: %s\n", db ? sqlite3_errmsg(db) : "unknown");
    if (db) sqlite3_close(db);
    return 3;
  }
  int reserve = 80;
  rc = sqlite3_file_control(db, "main", SQLITE_FCNTL_RESERVE_BYTES, &reserve);
  if (rc != SQLITE_OK) {
    fprintf(stderr, "reserve file-control failed: %d\n", rc);
    sqlite3_close(db);
    return 4;
  }
  char *message = NULL;
  rc = sqlite3_exec(db, "VACUUM", NULL, NULL, &message);
  if (rc != SQLITE_OK) {
    fprintf(stderr, "vacuum failed: %s\n", message ? message : sqlite3_errmsg(db));
    sqlite3_free(message);
    sqlite3_close(db);
    return 5;
  }
  sqlite3_close(db);
  return 0;
}
