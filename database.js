const { google } = require('googleapis');
require('dotenv').config();

// Lê as credenciais JSON a partir de uma variável de ambiente ou arquivo local
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (err) {
  console.error("Erro ao carregar GOOGLE_CREDENTIALS da variável de ambiente:", err.message);
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

module.exports = {
  sheets,
  SPREADSHEET_ID
};