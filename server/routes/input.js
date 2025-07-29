const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { logger } = require('../config/logger');
const fetch = require('node-fetch');
const realtimeService = require('../services/realtimeService');

// Middleware to parse urlencoded bodies, as required by the /input endpoint
router.use(express.urlencoded({ extended: true }));

/**
 * Notifies the Flask webhook about an RFID update.
 * This function is asynchronous but we don't wait for its result (fire and forget).
 * @param {object} data - The data payload to send.
 */
const notifyFlask = (data) => {
    const webhookUrl = "http://127.0.0.1:5001/webhook/rfid";
    const payload = JSON.stringify({
        epc: data.epc,
        reader_name: data.reader_name,
        antenna: data.antenna,
        mac_address: data.mac_address,
        timestamp: new Date().toISOString(),
        action: 'update'
    });

    fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        timeout: 1000 // 1 second timeout
    }).catch(err => {
        // Log the error but don't block the main response
        logger.warn('Flask webhook notification failed', { error: err.message });
    });
};

/**
 * Route: POST /api/input
 * Handles data from RFID readers in x-www-form-urlencoded format.
 */
router.post('/input', async (req, res) => {
    logger.debug('Received request on /api/input', { body: req.body, headers: req.headers });
    const { reader_name, mac_address, field_delim, field_values } = req.body;

    if (!field_values) {
        return res.status(400).send({ error: 'Missing field_values' });
    }

    const rows = field_values.split('\n');
    if (rows[rows.length - 1] === '') {
        rows.pop();
    }

    const promises = rows.map(async (row) => {
        try {
            const resFields = row.split(field_delim);
            if (resFields.length < 2) return;

            const antenna = resFields[0].replace(/"/g, '');
            const epc = resFields[1].replace(/"/g, '');
            const macAddress = mac_address.replace(/\\"/g, '');
            const readerName = reader_name.replace(/\\"/g, '');
            // Create UTC timestamp to avoid timezone issues (server is in Europe/Paris)
            const nowUTC = new Date().toISOString().slice(0, 19).replace('T', ' ');

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

            await pool.execute(sql, [macAddress, readerName, epc, nowUTC, nowUTC, antenna]);
            
            // Publish realtime event to Redis
            await realtimeService.publishRFIDEvent({
                epc,
                reader_name: readerName,
                antenna,
                mac_address: macAddress,
                timestamp: nowUTC,
                endpoint: '/input'
            });
            
            notifyFlask({ epc, reader_name: readerName, antenna, mac_address: macAddress });
            
            logger.debug('RFID data processed via /input', { epc, readerName });

        } catch (error) {
            logger.error('Failed to process /input row', { error: error.message, row });
        }
    });

    await Promise.all(promises);
    res.status(200).send('OK');
});

/**
 * Route: POST /api/input2
 * Handles data from RFID readers in JSON format.
 */
router.post('/input2', async (req, res) => {
    logger.debug('Received request on /api/input2', { body: req.body, headers: req.headers });
    const rows = req.body;

    if (!Array.isArray(rows)) {
        return res.status(400).send({ error: 'Expected a JSON array' });
    }

    const promises = rows.map(async (row) => {
        try {
            const { ant, epc, customcode } = row;
            if (!ant || !epc || !customcode) return;

            const antenna = 'B' + ant;
            const readerName = customcode;
            const macAddress = 'ChinaReaderMac';
            // Create UTC timestamp to avoid timezone issues (server is in Europe/Paris)
            const nowUTC = new Date().toISOString().slice(0, 19).replace('T', ' ');

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

            await pool.execute(sql, [macAddress, antenna, epc, nowUTC, readerName, nowUTC]);

            // Publish realtime event to Redis
            await realtimeService.publishRFIDEvent({
                epc,
                reader_name: readerName,
                antenna,
                mac_address: macAddress,
                timestamp: nowUTC,
                endpoint: '/input2'
            });

            notifyFlask({ epc, reader_name: readerName, antenna, mac_address: macAddress });

            logger.debug('RFID data processed via /input2', { epc, readerName });

        } catch (error) {
            logger.error('Failed to process /input2 row', { error: error.message, row });
        }
    });

    await Promise.all(promises);
    res.status(200).send('OK');
});

module.exports = router;
