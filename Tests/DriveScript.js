/**
 * Google Drive File Inventory → Excel
 * ------------------------------------
 * Lists every file in your Drive (including subfolders) and writes
 * metadata to an Excel file: name, size, MIME type, folder path,
 * owner, shared status, created/modified dates, webViewLink, and more.
 *
 * Setup:
 *   npm install googleapis exceljs
 *
 * Authentication (one-time):
 *   1. Go to https://console.cloud.google.com
 *   2. Create a project → Enable "Google Drive API"
 *   3. Create OAuth 2.0 credentials (Desktop app type)
 *   4. Download the JSON → save as credentials.json next to this file
 *   5. Run the script once → it opens a browser to authorize → saves token.json
 *
 * Usage:
 *   node drive-to-excel.js
 *
 * Output:
 *   drive-inventory.xlsx  (in the same directory)
 */


const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');
const ExcelJS = require('exceljs');


// ── Config ────────────────────────────────────────────────────────────────────
const CREDENTIALS_FILE = path.join(__dirname, 'credentials.json');
const TOKEN_FILE = path.join(__dirname, 'token.json');
const OUTPUT_FILE = path.join(__dirname, 'drive-inventory.xlsx');
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
const PAGE_SIZE = 1000; // max allowed by the API
// ─────────────────────────────────────────────────────────────────────────────


// ── Auth helpers ──────────────────────────────────────────────────────────────
async function authorize() {
  const raw = fs.readFileSync(CREDENTIALS_FILE);
  const { client_secret, client_id, redirect_uris } =
    JSON.parse(raw).installed || JSON.parse(raw).web;


  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0],
  );


  if (fs.existsSync(TOKEN_FILE)) {
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_FILE)));
    return oAuth2Client;
  }


  return getNewToken(oAuth2Client);
}


function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });


  console.log('\nOpen this URL in your browser to authorize:\n');
  console.log(authUrl);
  console.log();


  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Paste the authorization code here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code.trim(), (err, token) => {
        if (err) return reject(err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
        console.log('✅  Token saved to', TOKEN_FILE);
        resolve(oAuth2Client);
      });
    });
  });
}
// ─────────────────────────────────────────────────────────────────────────────


// ── Drive helpers ─────────────────────────────────────────────────────────────


/**
 * Fetch ALL files from Drive (handles pagination automatically).
 * Returns a flat array of file resource objects.
 */
async function listAllFiles(drive) {
  const fields = [
    'id',
    'name',
    'mimeType',
    'size',
    'parents',
    'owners',
    'shared',
    'trashed',
    'starred',
    'createdTime',
    'modifiedTime',
    'viewedByMeTime',
    'webViewLink',
    'webContentLink',
    'description',
    'md5Checksum',
    'quotaBytesUsed',
    'version',
    'lastModifyingUser/displayName',
  ].join(',');


  let files = [];
  let pageToken = null;
  let page = 1;


  do {
    process.stdout.write(
      `\r  Fetching page ${page}… (${files.length} files so far)`,
    );


    const res = await drive.files.list({
      pageSize: PAGE_SIZE,
      pageToken: pageToken || undefined,
      fields: `nextPageToken, files(${fields})`,
      // Remove this filter to also include items in the trash:
      q: 'trashed = false',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });


    files = files.concat(res.data.files || []);
    pageToken = res.data.nextPageToken;
    page++;
  } while (pageToken);


  console.log(`\n  Done. ${files.length} files retrieved.\n`);
  return files;
}


/**
 * Build a map of { folderId → full/path/string } so we can
 * show a human-readable folder path for every file.
 */
function buildFolderPaths(files) {
  const folderMap = {}; // id → { name, parents }


  for (const f of files) {
    if (f.mimeType === 'application/vnd.google-apps.folder') {
      folderMap[f.id] = { name: f.name, parents: f.parents || [] };
    }
  }


  const pathCache = {};


  function getPath(id, visited = new Set()) {
    if (pathCache[id]) return pathCache[id];
    if (visited.has(id)) return '(circular)';
    visited.add(id);


    const folder = folderMap[id];
    if (!folder) return 'My Drive';


    const parentId = folder.parents[0];
    if (!parentId || !folderMap[parentId]) {
      pathCache[id] = folder.name;
      return folder.name;
    }


    const parentPath = getPath(parentId, visited);
    pathCache[id] = `${parentPath} / ${folder.name}`;
    return pathCache[id];
  }


  // Pre-compute all folder paths
  for (const id of Object.keys(folderMap)) getPath(id);


  return pathCache;
}


/** Format bytes to a human-readable string (e.g. "3.2 MB"). */
function formatBytes(bytes) {
  if (!bytes) return '';
  const b = parseInt(bytes, 10);
  if (isNaN(b)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let val = b;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}


/** Strip "application/vnd.google-apps." prefix for readability. */
function friendlyMime(mime) {
  if (!mime) return '';
  return mime
    .replace('application/vnd.google-apps.', 'Google ')
    .replace('application/', '');
}
// ─────────────────────────────────────────────────────────────────────────────


// ── Excel writer ──────────────────────────────────────────────────────────────
async function writeExcel(files, folderPaths) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'drive-to-excel.js';
  wb.created = new Date();


  const ws = wb.addWorksheet('Drive Inventory', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });


  // ── Column definitions ──────────────────────────────────────────────────────
  ws.columns = [
    { header: 'Name', key: 'name', width: 45 },
    { header: 'Type', key: 'type', width: 22 },
    { header: 'Size (bytes)', key: 'sizeBytes', width: 15 },
    { header: 'Size (readable)', key: 'sizeHuman', width: 14 },
    { header: 'Folder Path', key: 'folderPath', width: 50 },
    { header: 'Owner', key: 'owner', width: 28 },
    { header: 'Last Modified By', key: 'modifiedBy', width: 28 },
    { header: 'Created', key: 'created', width: 22 },
    { header: 'Modified', key: 'modified', width: 22 },
    { header: 'Last Viewed By Me', key: 'viewed', width: 22 },
    { header: 'Shared', key: 'shared', width: 10 },
    { header: 'Starred', key: 'starred', width: 10 },
    { header: 'MD5 Checksum', key: 'md5', width: 36 },
    { header: 'Version', key: 'version', width: 10 },
    { header: 'Description', key: 'description', width: 40 },
    { header: 'Web View Link', key: 'webViewLink', width: 60 },
    { header: 'Download Link', key: 'webContentLink', width: 60 },
    { header: 'File ID', key: 'id', width: 36 },
  ];


  // ── Header styling ──────────────────────────────────────────────────────────
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      name: 'Arial',
      size: 11,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F497D' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: false,
    };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
    };
  });
  headerRow.height = 22;


  // ── Data rows ───────────────────────────────────────────────────────────────
  const dateFmt = 'YYYY-MM-DD HH:mm:ss';
  let rowNum = 2;


  for (const f of files) {
    const parentId = f.parents ? f.parents[0] : null;
    let folderPath = 'My Drive';
    if (parentId) {
      folderPath = folderPaths[parentId]
        ? `My Drive / ${folderPaths[parentId]}`
        : 'My Drive';
    }


    const row = ws.addRow({
      name: f.name || '',
      type: friendlyMime(f.mimeType),
      sizeBytes: f.size ? parseInt(f.size, 10) : '',
      sizeHuman: formatBytes(f.size || f.quotaBytesUsed),
      folderPath,
      owner: f.owners ? f.owners.map((o) => o.displayName).join(', ') : '',
      modifiedBy: f.lastModifyingUser ? f.lastModifyingUser.displayName : '',
      created: f.createdTime ? new Date(f.createdTime) : '',
      modified: f.modifiedTime ? new Date(f.modifiedTime) : '',
      viewed: f.viewedByMeTime ? new Date(f.viewedByMeTime) : '',
      shared: f.shared ? 'Yes' : 'No',
      starred: f.starred ? 'Yes' : 'No',
      md5: f.md5Checksum || '',
      version: f.version || '',
      description: f.description || '',
      webViewLink: f.webViewLink || '',
      webContentLink: f.webContentLink || '',
      id: f.id || '',
    });


    // Format date cells
    ['created', 'modified', 'viewed'].forEach((key) => {
      const cell = row.getCell(key);
      if (cell.value instanceof Date) {
        cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      }
    });


    // Right-align size bytes
    row.getCell('sizeBytes').alignment = { horizontal: 'right' };


    // Alternating row background
    if (rowNum % 2 === 0) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEEF3FA' },
        };
      });
    }


    // Make links clickable
    if (f.webViewLink) {
      const cell = row.getCell('webViewLink');
      cell.value = { text: 'Open', hyperlink: f.webViewLink };
      cell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }


    row.font = { name: 'Arial', size: 10 };
    rowNum++;
  }


  // ── Auto-filter & summary sheet ─────────────────────────────────────────────
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };


  // ── Summary sheet ───────────────────────────────────────────────────────────
  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 35 },
    { header: 'Value', key: 'value', width: 20 },
  ];


  const folders = files.filter(
    (f) => f.mimeType === 'application/vnd.google-apps.folder',
  );
  const nonFolders = files.filter(
    (f) => f.mimeType !== 'application/vnd.google-apps.folder',
  );
  const totalBytes = nonFolders.reduce(
    (acc, f) => acc + parseInt(f.size || f.quotaBytesUsed || 0, 10),
    0,
  );


  const mimeGroups = {};
  for (const f of nonFolders) {
    const t = friendlyMime(f.mimeType);
    mimeGroups[t] = (mimeGroups[t] || 0) + 1;
  }


  const summaryData = [
    ['Total items', files.length],
    ['Folders', folders.length],
    ['Files (non-folder)', nonFolders.length],
    ['Total size', formatBytes(totalBytes)],
    ['Shared files', files.filter((f) => f.shared).length],
    ['Starred files', files.filter((f) => f.starred).length],
    ['Report generated at', new Date().toISOString()],
    ['', ''],
    ['── By file type ──', ''],
    ...Object.entries(mimeGroups).sort((a, b) => b[1] - a[1]),
  ];


  for (const [metric, value] of summaryData) {
    const r = summary.addRow({ metric, value });
    r.font = { name: 'Arial', size: 10 };
  }


  // Style summary header
  summary.getRow(1).eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      name: 'Arial',
      size: 11,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F497D' },
    };
    cell.alignment = { horizontal: 'center' };
  });


  await wb.xlsx.writeFile(OUTPUT_FILE);
  console.log(`\n✅  Excel file written: ${OUTPUT_FILE}`);
  console.log(
    `   Sheets: "Drive Inventory" (${files.length} rows) + "Summary"\n`,
  );
}
// ─────────────────────────────────────────────────────────────────────────────


// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      console.error(`\n❌  Missing credentials.json\n`);
      console.error(`  1. Go to https://console.cloud.google.com`);
      console.error(`  2. Create a project and enable the Google Drive API`);
      console.error(`  3. Create OAuth 2.0 credentials (Desktop app)`);
      console.error(
        `  4. Download the JSON file and save it as credentials.json next to this script\n`,
      );
      process.exit(1);
    }


    console.log('\n🔑  Authorizing with Google…');
    const auth = await authorize();


    const drive = google.drive({ version: 'v3', auth });


    console.log('📂  Fetching all Drive files…');
    const files = await listAllFiles(drive);


    console.log('🗂   Building folder paths…');
    const folderPaths = buildFolderPaths(files);


    console.log('📊  Writing Excel file…');
    await writeExcel(files, folderPaths);
  } catch (err) {
    console.error('\n❌  Error:', err.message || err);
    if (err.response)
      console.error(
        '   API response:',
        JSON.stringify(err.response.data, null, 2),
      );
    process.exit(1);
  }
})();