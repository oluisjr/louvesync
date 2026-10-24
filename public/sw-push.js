// Compatibility for older installations that registered this URL at scope /.
// Keep the same cache/update lifecycle instead of replacing it with a push-only worker.
importScripts('/sw.js');
