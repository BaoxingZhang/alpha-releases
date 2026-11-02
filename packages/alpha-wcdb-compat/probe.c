#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef int32_t (*wcdb_init_fn)(void);
typedef int32_t (*wcdb_shutdown_fn)(void);
typedef int32_t (*wcdb_open_account_fn)(const char *, const char *, int64_t *);
typedef int32_t (*wcdb_close_account_fn)(int64_t);
typedef void (*wcdb_free_string_fn)(void *);
typedef int32_t (*wcdb_get_sns_timeline_fn)(int64_t, int32_t, int32_t, const char *, const char *, int32_t, int32_t, void **);

typedef struct {
  const char *name;
  void *value;
} symbol_entry;

static void print_error(const char *code, int32_t status) {
  if (status == INT32_MIN) {
    printf("{\"ok\":false,\"error\":{\"code\":\"%s\"}}\n", code);
  } else {
    printf("{\"ok\":false,\"error\":{\"code\":\"%s\",\"status\":%d}}\n", code, status);
  }
}

static const char *basename_only(const char *value) {
  const char *slash = strrchr(value, '/');
  return slash ? slash + 1 : value;
}

static int is_absolute_path(const char *value) {
  return value != NULL && value[0] == '/' && value[1] != '\0' && strchr(value, '\n') == NULL && strchr(value, '\r') == NULL;
}

static int32_t parse_int32(const char *value, int32_t fallback) {
  if (value == NULL || *value == '\0') return fallback;
  char *end = NULL;
  long parsed = strtol(value, &end, 10);
  if (end == value || *end != '\0' || parsed < INT32_MIN || parsed > INT32_MAX) return INT32_MIN;
  return (int32_t)parsed;
}

static size_t base64_size(size_t input_size) {
  return ((input_size + 2) / 3) * 4;
}

static char *base64_encode(const unsigned char *input, size_t input_size) {
  static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t output_size = base64_size(input_size);
  char *output = (char *)malloc(output_size + 1);
  if (output == NULL) return NULL;
  size_t in = 0;
  size_t out = 0;
  while (in < input_size) {
    size_t start = in;
    uint32_t value = (uint32_t)input[in++] << 16;
    if (in < input_size) value |= (uint32_t)input[in++] << 8;
    if (in < input_size) value |= input[in++];
    size_t remaining = input_size - start;
    output[out++] = alphabet[(value >> 18) & 0x3f];
    output[out++] = alphabet[(value >> 12) & 0x3f];
    output[out++] = remaining > 1 ? alphabet[(value >> 6) & 0x3f] : '=';
    output[out++] = remaining > 2 ? alphabet[value & 0x3f] : '=';
  }
  output[out] = '\0';
  return output;
}

static void usage(void) {
  fprintf(stderr, "usage: probe --library /absolute/lib --op probe|sns-timeline [options]\n");
}

int main(int argc, char **argv) {
  const char *library_path = NULL;
  const char *operation = NULL;
  const char *account_dir = NULL;
  const char *key = NULL;
  const char *username = "";
  const char *keyword = "";
  int32_t limit = 100;
  int32_t offset = 0;
  int32_t start_time = 0;
  int32_t end_time = 0;

  for (int i = 1; i < argc; i += 2) {
    if (i + 1 >= argc) {
      usage();
      print_error("WCDB_COMPAT_ARGUMENTS_INVALID", INT32_MIN);
      return 2;
    }
    const char *name = argv[i];
    const char *value = argv[i + 1];
    if (strcmp(name, "--library") == 0) library_path = value;
    else if (strcmp(name, "--op") == 0) operation = value;
    else if (strcmp(name, "--account-dir") == 0) account_dir = value;
    else if (strcmp(name, "--key") == 0) key = value;
    else if (strcmp(name, "--username") == 0) username = value;
    else if (strcmp(name, "--keyword") == 0) keyword = value;
    else if (strcmp(name, "--limit") == 0) limit = parse_int32(value, INT32_MIN);
    else if (strcmp(name, "--offset") == 0) offset = parse_int32(value, INT32_MIN);
    else if (strcmp(name, "--start-time") == 0) start_time = parse_int32(value, INT32_MIN);
    else if (strcmp(name, "--end-time") == 0) end_time = parse_int32(value, INT32_MIN);
    else {
      usage();
      print_error("WCDB_COMPAT_ARGUMENTS_INVALID", INT32_MIN);
      return 2;
    }
  }
  if (!is_absolute_path(library_path) || operation == NULL || (strcmp(operation, "probe") != 0 && strcmp(operation, "sns-timeline") != 0)) {
    print_error("WCDB_COMPAT_ARGUMENTS_INVALID", INT32_MIN);
    return 2;
  }
  if (limit == INT32_MIN || offset == INT32_MIN || start_time == INT32_MIN || end_time == INT32_MIN || limit < 1 || limit > 10000 || offset < 0) {
    print_error("WCDB_COMPAT_ARGUMENTS_INVALID", INT32_MIN);
    return 2;
  }

  void *library = dlopen(library_path, RTLD_LOCAL | RTLD_NOW);
  if (library == NULL) {
    print_error("WCDB_COMPAT_LIBRARY_OPEN_FAILED", INT32_MIN);
    return 3;
  }

  symbol_entry required[] = {
    {"wcdb_init", dlsym(library, "wcdb_init")},
    {"wcdb_shutdown", dlsym(library, "wcdb_shutdown")},
    {"wcdb_open_account", dlsym(library, "wcdb_open_account")},
    {"wcdb_close_account", dlsym(library, "wcdb_close_account")},
    {"wcdb_free_string", dlsym(library, "wcdb_free_string")},
  };
  symbol_entry optional[] = {
    {"wcdb_get_sns_timeline", dlsym(library, "wcdb_get_sns_timeline")},
    {"wcdb_get_sns_usernames", dlsym(library, "wcdb_get_sns_usernames")},
    {"wcdb_get_sns_annual_stats", dlsym(library, "wcdb_get_sns_annual_stats")},
    {"wcdb_get_voice_data", dlsym(library, "wcdb_get_voice_data")},
    {"wcdb_resolve_image_hardlink", dlsym(library, "wcdb_resolve_image_hardlink")},
    {"wcdb_scan_media_stream", dlsym(library, "wcdb_scan_media_stream")},
    {"wcdb_update_message", dlsym(library, "wcdb_update_message")},
    {"wcdb_delete_message", dlsym(library, "wcdb_delete_message")},
    {"wcdb_install_sns_block_delete_trigger", dlsym(library, "wcdb_install_sns_block_delete_trigger")},
  };
  for (size_t i = 0; i < sizeof(required) / sizeof(required[0]); i++) {
    if (required[i].value == NULL) {
      dlclose(library);
      print_error("WCDB_COMPAT_REQUIRED_SYMBOL_MISSING", INT32_MIN);
      return 4;
    }
  }

  wcdb_init_fn init_fn = (wcdb_init_fn)required[0].value;
  wcdb_shutdown_fn shutdown_fn = (wcdb_shutdown_fn)required[1].value;
  int32_t init_status = init_fn();
  if (init_status != 0) {
    dlclose(library);
    print_error("WCDB_COMPAT_INIT_FAILED", init_status);
    return 5;
  }

  if (strcmp(operation, "probe") == 0) {
    printf("{\"ok\":true,\"result\":{\"schema\":\"alpha-third-party-wcdb-probe.v1\",\"nativeSchemaSupported\":false,\"libraryBasename\":\"%s\",\"symbols\":{", basename_only(library_path));
    for (size_t i = 0; i < sizeof(required) / sizeof(required[0]); i++) printf("%s\"%s\":true", i ? "," : "", required[i].name);
    for (size_t i = 0; i < sizeof(optional) / sizeof(optional[0]); i++) printf(",\"%s\":%s", optional[i].name, optional[i].value ? "true" : "false");
    printf("}}}\n");
    shutdown_fn();
    dlclose(library);
    return 0;
  }

  if (account_dir == NULL || key == NULL || !is_absolute_path(account_dir) || *key == '\0' || strlen(key) > 256 || strchr(key, '\n') != NULL || strchr(key, '\r') != NULL || optional[0].value == NULL) {
    shutdown_fn();
    dlclose(library);
    print_error(optional[0].value == NULL ? "WCDB_COMPAT_SNS_SYMBOL_MISSING" : "WCDB_COMPAT_ARGUMENTS_INVALID", INT32_MIN);
    return 6;
  }

  wcdb_open_account_fn open_fn = (wcdb_open_account_fn)required[2].value;
  wcdb_close_account_fn close_fn = (wcdb_close_account_fn)required[3].value;
  wcdb_free_string_fn free_fn = (wcdb_free_string_fn)required[4].value;
  wcdb_get_sns_timeline_fn timeline_fn = (wcdb_get_sns_timeline_fn)optional[0].value;
  int64_t handle = 0;
  int32_t open_status = open_fn(account_dir, key, &handle);
  if (open_status != 0 || handle == 0) {
    shutdown_fn();
    dlclose(library);
    print_error("WCDB_COMPAT_ACCOUNT_OPEN_FAILED", open_status);
    return 7;
  }
  void *output = NULL;
  int32_t timeline_status = timeline_fn(handle, limit, offset, username, keyword, start_time, end_time, &output);
  if (timeline_status != 0 || output == NULL) {
    close_fn(handle);
    shutdown_fn();
    dlclose(library);
    print_error("WCDB_COMPAT_SNS_TIMELINE_FAILED", timeline_status);
    return 8;
  }
  size_t output_size = strnlen((const char *)output, 16 * 1024 * 1024 + 1);
  if (output_size > 16 * 1024 * 1024) {
    free_fn(output);
    close_fn(handle);
    shutdown_fn();
    dlclose(library);
    print_error("WCDB_COMPAT_RESPONSE_TOO_LARGE", INT32_MIN);
    return 9;
  }
  char *encoded = base64_encode((const unsigned char *)output, output_size);
  free_fn(output);
  close_fn(handle);
  shutdown_fn();
  dlclose(library);
  if (encoded == NULL) {
    print_error("WCDB_COMPAT_ENCODE_FAILED", INT32_MIN);
    return 10;
  }
  printf("{\"ok\":true,\"result\":{\"schema\":\"alpha-third-party-wcdb-sns.v1\",\"nativeSchemaSupported\":false,\"rawJsonBase64\":\"%s\"}}\n", encoded);
  free(encoded);
  return 0;
}
