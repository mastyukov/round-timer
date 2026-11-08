/**
 * Round Timer lightweight error-only receiver for a PRIVATE Google Sheet.
 * Runs as a Google Apps Script Web App: execute as owner, access anyone.
 * NO session tracking, device IDs, IP storage, names, settings or workouts.
 *
 * Never publish spreadsheet IDs or its contents.
 * The HTTP service provider can still see connection metadata.
 */
var RT_EVENT_TYPES = ['app_error', 'asset_error', 'audio_failure'];
var RT_ERROR_CODES = ['UNHANDLED_ERROR', 'AUDIO_PLAY_REJECTED', 'CACHE_INSTALL_FAILED', 'ASSET_LOAD_FAILED', 'UNKNOWN'];
var RT_COMPONENTS = ['ui', 'audio', 'cache', 'assets', 'other'];
var RT_PROPERTY_ID = 'ROUND_TIMER_DIAGNOSTICS_SHEET_ID';
var RT_MAX_EVENTS_PER_DAY = 200;

function parseDiagnosticPayload(raw) {
  if (typeof raw !== 'string' || raw.length > 400) return null;
  try {
    var p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    if (RT_EVENT_TYPES.indexOf(p.event) < 0) return null;
    if (RT_ERROR_CODES.indexOf(p.code) < 0) return null;
    if (RT_COMPONENTS.indexOf(p.component) < 0) return null;
    if (typeof p.version !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(p.version)) return null;
    // Project into four safe fields; all unknown fields are discarded.
    return {
      event: p.event, code: p.code,
      component: p.component, version: p.version
    };
  } catch (ignored) {
    return null;
  }
}

function response(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
}

function doGet() {
  return response('Round Timer diagnostics endpoint. POST technical errors only.');
}

function doPost(e) {
  var raw = e && e.postData && e.postData.contents;
  var event = parseDiagnosticPayload(raw);
  if (!event) return response('ignored');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return response('busy');
  try {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(RT_PROPERTY_ID);
    var book;
    if (!id) {
      book = SpreadsheetApp.create('Round Timer - aggregated technical errors');
      props.setProperty(RT_PROPERTY_ID, book.getId());
    } else {
      book = SpreadsheetApp.openById(id);
    }
    var sheet = book.getSheets()[0];
    if (!sheet.getLastRow()) {
      sheet.appendRow(['UTC date', 'error type', 'code', 'component', 'version', 'count']);
    }
    var day = Utilities.formatDate(new Date(), 'Etc/UTC', 'yyyy-MM-dd');
    var last = sheet.getLastRow();
    var rows = last > 1 ? sheet.getRange(2, 1, last - 1, 6).getValues() : [];
    var totalToday = 0, foundRow = 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r[0]) !== day) continue;
      totalToday += Number(r[5]) || 0;
      if (r[1] === event.event && r[2] === event.code &&
          r[3] === event.component && r[4] === event.version) foundRow = i + 2;
    }
    if (totalToday >= RT_MAX_EVENTS_PER_DAY) return response('limit');
    if (foundRow) {
      var counter = sheet.getRange(foundRow, 6);
      counter.setValue(Number(counter.getValue()) + 1);
    } else {
      sheet.appendRow([day, event.event, event.code, event.component, event.version, 1]);
    }
    // Opportunistic cleanup: deletes old aggregates when new error arrives.
    // If no traffic occurs, perform manual cleanup or add an owner-only daily trigger.
    var cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    for (var j = rows.length - 1; j >= 0; j--) {
      if (typeof rows[j][0] === 'string' && rows[j][0] < cutoff) sheet.deleteRow(j + 2);
    }
    return response('stored');
  } catch (ignored) {
    // No raw payload or exception details in server logs.
    return response('unavailable');
  } finally {
    lock.releaseLock();
  }
}
