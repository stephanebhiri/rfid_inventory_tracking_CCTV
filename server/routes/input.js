const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { logger } = require('../logger');
const fetchFn = globalThis.fetch || require('node-fetch');
const realtimeService = require('../services/realtimeService');

// Middleware to parse urlencoded bodies, as required by the /input endpoint
router.use(express.urlencoded({ extended: true, limit: '2mb' }));
router.use(express.json({ limit: '2mb' })); // safety for /input2 if app-level middleware change

/**
 * Notifies the Flask webhook about an RFID update.
 * This function is asynchronous but we don't wait for its result (fire and forget).
 * @param {object} data - The data payload to send.
 */
const notifyFlask = (data) => {
  const webhookUrl = process.env.FLASK_WEBHOOK_URL || "http://127.0.0.1:5001/webhook/rfid";
  const payload = JSON.stringify({
    epc: data.epc,
    reader_name: data.reader_name,
    antenna: data.antenna,
    mac_address: data.mac_address,
    timestamp: new Date().toISOString(),
    action: 'update'
  });
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 1000); // 1s portable timeout
  fetchFn(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    signal: ac.signal
  })
  .catch(err => {
    logger.warn('Flask webhook notification failed', { error: err.message });
  })
  .finally(() => clearTimeout(timeout));
};

/**
 * Route: POST /api/input
 * Handles data from RFID readers in x-www-form-urlencoded format.
 */
router.post('/input', async (req, res) => {
  // évite les logs géants
  const raw = req.body?.field_values || '';
  const approxLines = String(raw).split(/\r?\n/).filter(Boolean).length;
  logger.debug('Received /api/input', { lines: approxLines, headers: { 'content-type': req.headers['content-type'] } });
  const { reader_name, mac_address, field_delim, field_values } = req.body || {};

  if (!field_values) {
    return res.status(400).send({ error: 'Missing field_values' });
  }

  const rows = String(field_values).trim().split(/\r?\n/).filter(Boolean);

  // prepare statement once per request (light perf gain)
  const sql = `
    INSERT INTO item (mac_address, reader_name, epc, epc_timestamp, updated_at, antenna)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE 
      mac_address=VALUES(mac_address), 
      reader_name=VALUES(reader_name),
      epc_timestamp=VALUES(epc_timestamp), 
      updated_at=VALUES(updated_at), 
      antenna=VALUES(antenna)
  `;
  let processed = 0, failed = 0;

  // simple concurrency cap to avoid huge bursts
  const CONCURRENCY = Number(process.env.INPUT_CONCURRENCY || 20);
  let inFlight = 0;
  const queue = [];

  // timestamp commun à la requête (si ok pour ton besoin)
  const nowUTC = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const runRow = async (row) => {
    try {
      const delim = field_delim ?? ',';
      const resFields = row.split(delim);
      if (resFields.length < 2) return;

      const antenna = resFields[0].replace(/"/g, '');
      const epc = resFields[1].replace(/"/g, '');
      const macAddress = (mac_address || '').replace(/\\"/g, '');
      const readerName = (reader_name || '').replace(/\\"/g, '');

      await pool.execute(sql, [macAddress, readerName, epc, nowUTC, nowUTC, antenna]);
      
      // option: fire-and-forget pour réduire la latence d'ingestion
      const publish = realtimeService.publishRFIDEvent({
        epc, reader_name: readerName, antenna, mac_address: macAddress,
        timestamp: nowUTC, endpoint: '/input'
      });
      publish.catch(e => logger.warn('publishRFIDEvent failed', { error: e.message, endpoint: '/input' }));
      
      notifyFlask({ epc, reader_name: readerName, antenna, mac_address: macAddress });
      
      logger.debug('RFID data processed via /input', { epc, readerName });
      processed++;

    } catch (error) {
      logger.error('Failed to process /input row', { error: error.message, row });
      failed++;
    }
  };

  for (const row of rows) {
    if (inFlight >= CONCURRENCY) {
      await queue.shift();
    }
    const p = runRow(row).finally(() => { inFlight--; });
    inFlight++;
    queue.push(p);
  }
  await Promise.all(queue);
  res.status(200).json({ ok: true, processed, failed });
});

/**
 * Route: POST /api/input2
 * Handles data from RFID readers in JSON format.
 */
router.post('/input2', async (req, res) => {
  logger.debug('Received /api/input2', { count: Array.isArray(req.body) ? req.body.length : 0,
    headers: { 'content-type': req.headers['content-type'] } });
  const rows = req.body;

  if (!Array.isArray(rows)) {
    return res.status(400).send({ error: 'Expected a JSON array' });
  }

  let processed = 0, failed = 0;
  const CONCURRENCY = Number(process.env.INPUT_CONCURRENCY || 20);
  let inFlight = 0;
  const queue = [];

  const sql = `
    INSERT INTO item (mac_address, antenna, epc, updated_at, reader_name, epc_timestamp)  
    VALUES(?, ?, ?, ?, ?, ?) 
    ON DUPLICATE KEY UPDATE  
      mac_address=VALUES(mac_address),
      antenna=VALUES(antenna), 
      updated_at=VALUES(updated_at), 
      reader_name=VALUES(reader_name), 
      epc_timestamp=VALUES(epc_timestamp)
  `;

  const nowUTC = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const runRow = async (row) => {
    try {
      const { ant, epc, customcode } = row;
      if (!ant || !epc || !customcode) return;

      const antenna = 'B' + ant;
      const readerName = customcode;
      const macAddress = 'ChinaReaderMac';

      await pool.execute(sql, [macAddress, antenna, epc, nowUTC, readerName, nowUTC]);

      const publish = realtimeService.publishRFIDEvent({
        epc, reader_name: readerName, antenna, mac_address: macAddress,
        timestamp: nowUTC, endpoint: '/input2'
      });
      publish.catch(e => logger.warn('publishRFIDEvent failed', { error: e.message, endpoint: '/input2' }));

      notifyFlask({ epc, reader_name: readerName, antenna, mac_address: macAddress });

      logger.debug('RFID data processed via /input2', { epc, readerName });
      processed++;

    } catch (error) {
      logger.error('Failed to process /input2 row', { error: error.message, row });
      failed++;
    }
  };

  for (const row of rows) {
    if (inFlight >= CONCURRENCY) {
      await queue.shift();
    }
    const p = runRow(row).finally(() => { inFlight--; });
    inFlight++;
    queue.push(p);
  }
  await Promise.all(queue);
  res.status(200).json({ ok: true, processed, failed });
});

/**
 * Route: POST /api/rfid/write
 * Reçoit une demande de gravure RFID (UHF Gen2)
 */
router.post('/rfid/write', async (req, res) => {
  const { epc, mac_address, serial } = req.body || {};
  
  if (!epc || !mac_address || !serial) {
    return res.status(400).json({ error: 'Missing epc, serial or mac_address' });
  }

  // Log + future extension vers graveur UART
  logger.info('Received RFID write request', { epc, serial, mac_address });

  try {
    // Créer l'item dans la base avec valeurs par défaut pour affichage
    await pool.execute(`
      INSERT INTO item (epc, mac_address, serial_number, group_id, designation, brand, model, category, updated_at, epc_timestamp, antenna, reader_name, show_in_main)
      VALUES (?, ?, ?, 5, 'Item gravé RFID', 'RFID Writer', 'UHF Gen2', 'RFID_WRITTEN', NOW(), NOW(), '0', 'RFID Writer WiFi', 1)
      ON DUPLICATE KEY UPDATE 
        mac_address=VALUES(mac_address), 
        serial_number=VALUES(serial_number),
        updated_at=VALUES(updated_at),
        epc_timestamp=VALUES(epc_timestamp)
    `, [epc, mac_address, serial]);

    res.status(200).json({ success: true, message: 'RFID item written and registered', epc, serial });
  } catch (error) {
    logger.error('Error in /rfid/write', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
