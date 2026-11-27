#include <gtk/gtk.h>
#include <string.h>
#include <webkit2/webkit2.h>

typedef struct {
    const char *name;
    gboolean ephemeral;
    gboolean visible;
    gboolean register_late;
    WebKitWebContext *context;
    GtkWidget *window;
    GMainLoop *loop;
    gboolean document_requested;
    gboolean module_requested;
    gboolean finished;
    gboolean passed;
    gboolean done;
    guint deadline;
} Probe;

static void finish(Probe *probe, gboolean passed) {
    if (probe->done) return;
    probe->done = TRUE;
    probe->passed = passed;
    g_main_loop_quit(probe->loop);
}

static void check_ready(WebKitWebView *view, Probe *probe) {
    if (probe->finished && probe->document_requested && probe->module_requested &&
        g_strcmp0(webkit_web_view_get_title(view), "offline-probe-ready") == 0) {
        finish(probe, TRUE);
    }
}

static void title_changed(WebKitWebView *view, GParamSpec *property, Probe *probe) {
    (void)property;
    check_ready(view, probe);
}

static void load_changed(WebKitWebView *view, WebKitLoadEvent event, Probe *probe) {
    g_print("%s load-event=%d\n", probe->name, event);
    if (event == WEBKIT_LOAD_FINISHED) probe->finished = TRUE;
    check_ready(view, probe);
}

static gboolean load_failed(WebKitWebView *view, WebKitLoadEvent event, const gchar *uri,
                            GError *error, Probe *probe) {
    (void)view;
    (void)uri;
    g_print("%s load-failed event=%d domain=%s code=%d\n", probe->name, event,
            g_quark_to_string(error->domain), error->code);
    finish(probe, FALSE);
    return FALSE;
}

static void process_terminated(WebKitWebView *view, WebKitWebProcessTerminationReason reason,
                               Probe *probe) {
    (void)view;
    g_print("%s web-process-terminated reason=%d\n", probe->name, reason);
    finish(probe, FALSE);
}

static gboolean timed_out(gpointer data) {
    Probe *probe = data;
    probe->deadline = 0;
    finish(probe, FALSE);
    return G_SOURCE_REMOVE;
}

static void scheme_requested(WebKitURISchemeRequest *request, gpointer data) {
    Probe *probe = data;
    const char *path = webkit_uri_scheme_request_get_path(request);
    const char *content;
    const char *type;
    if (g_strcmp0(path, "/index.html") == 0) {
        probe->document_requested = TRUE;
        content = "<!doctype html><meta charset=utf-8><title>loading</title>"
                  "<meta http-equiv=Content-Security-Policy content=\"default-src 'none'; script-src 'self'\">"
                  "<script type=module src=/app.mjs></script>";
        type = "text/html";
    } else if (g_strcmp0(path, "/app.mjs") == 0) {
        probe->module_requested = TRUE;
        content = "document.title = 'offline-probe-ready';";
        type = "text/javascript";
    } else {
        g_autoptr(GError) error = g_error_new_literal(G_IO_ERROR, G_IO_ERROR_NOT_FOUND, "Unknown fixture resource");
        webkit_uri_scheme_request_finish_error(request, error);
        return;
    }
    g_autoptr(GInputStream) body = g_memory_input_stream_new_from_data(content, strlen(content), NULL);
    webkit_uri_scheme_request_finish(request, body, strlen(content), type);
}

static void register_scheme(Probe *probe) {
    WebKitSecurityManager *security = webkit_web_context_get_security_manager(probe->context);
    webkit_security_manager_register_uri_scheme_as_secure(security, "fs-probe");
    webkit_web_context_register_uri_scheme(probe->context, "fs-probe", scheme_requested, probe, NULL);
}

static gboolean run_probe(Probe *probe) {
    probe->context = probe->ephemeral ? webkit_web_context_new_ephemeral() : webkit_web_context_new();
    if (!probe->register_late) register_scheme(probe);

    GtkWidget *widget = webkit_web_view_new_with_context(probe->context);
    WebKitWebView *view = WEBKIT_WEB_VIEW(widget);
    probe->window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_container_add(GTK_CONTAINER(probe->window), widget);
    probe->loop = g_main_loop_new(NULL, FALSE);
    g_signal_connect(view, "load-changed", G_CALLBACK(load_changed), probe);
    g_signal_connect(view, "load-failed", G_CALLBACK(load_failed), probe);
    g_signal_connect(view, "web-process-terminated", G_CALLBACK(process_terminated), probe);
    g_signal_connect(view, "notify::title", G_CALLBACK(title_changed), probe);
    if (probe->visible) gtk_widget_show_all(probe->window);
    if (probe->register_late) register_scheme(probe);

    gboolean ephemeral = webkit_web_view_is_ephemeral(view);
    g_print("%s ephemeral=%d visible=%d\n", probe->name, ephemeral, probe->visible);
    if (ephemeral != probe->ephemeral) {
        probe->done = TRUE;
        g_main_loop_unref(probe->loop);
        return FALSE;
    }
    probe->deadline = g_timeout_add_seconds(12, timed_out, probe);
    webkit_web_view_load_uri(view, "fs-probe://localhost/index.html");
    if (ephemeral) g_clear_object(&probe->context);
    if (!probe->done) g_main_loop_run(probe->loop);
    if (probe->deadline) g_source_remove(probe->deadline);
    g_main_loop_unref(probe->loop);
    g_print("%s result=%s document=%d module=%d finished=%d\n", probe->name,
            probe->passed ? "pass" : "fail", probe->document_requested, probe->module_requested, probe->finished);
    return probe->passed;
}

int main(int argc, char **argv) {
    gtk_init(&argc, &argv);
    Probe probes[] = {
        {.name = "persistent-main-control", .visible = TRUE},
        {.name = "ephemeral-candidate", .ephemeral = TRUE},
        {.name = "ephemeral-recovery", .ephemeral = TRUE, .visible = TRUE},
        {.name = "ephemeral-candidate-late-scheme", .ephemeral = TRUE, .register_late = TRUE},
    };
    gboolean passed = TRUE;
    for (guint i = 0; i < G_N_ELEMENTS(probes); i++) {
        if (!run_probe(&probes[i])) passed = FALSE;
    }
    for (guint i = 0; i < G_N_ELEMENTS(probes); i++) {
        gtk_widget_destroy(probes[i].window);
        g_clear_object(&probes[i].context);
    }
    return passed ? 0 : 1;
}
