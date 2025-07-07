const express = require('express');
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const qrcode = require('qrcode-terminal');

// --- 1. CONFIGURACIÓN DE SUPABASE ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Error Crítico: Las variables de entorno de Supabase (SUPABASE_URL y SUPABASE_KEY) son requeridas.");
    process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 2. ALMACÉN DE SESIÓN PERSONALIZADO ---
class SupabaseAuthStore {
    async save(data) {
        const { error } = await supabase.from('sessions').upsert({ session_id: data.session, session_data: JSON.stringify(data) });
        if (error) console.error("Error al guardar la sesión:", error);
    }
    async extract({ session }) {
        const { data, error } = await supabase.from('sessions').select('session_data').eq('session_id', session).single();
        if (error && error.code !== 'PGRST116') console.error("Error al extraer la sesión:", error);
        return data ? JSON.parse(data.session_data) : null;
    }
    async delete({ session }) {
        const { error } = await supabase.from('sessions').delete().eq('session_id', session);
        if (error) console.error("Error al eliminar la sesión:", error);
    }
    async sessionExists({ session }) {
        const { data } = await supabase.from('sessions').select('session_id').eq('session_id', session).single();
        return data !== null;
    }
}

// --- 3. CONFIGURACIÓN DEL CLIENTE DE WHATSAPP ---

const store = new SupabaseAuthStore();

const client = new Client({
    authStrategy: new RemoteAuth({
        store: store,
        backupSyncIntervalMs: 60000,
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

// --- 4. SERVIDOR DE EXPRESS ---
const app = express();
app.use(express.json()); // Habilitar que Express entienda JSON
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('WhatsApp Bot con Supabase está activo.');
});

// NUEVO ENDPOINT PARA ENVIAR MENSAJES DESDE N8N
app.post('/send-message', async (req, res) => {
    const { to, text } = req.body;
    if (!to || !text) {
        return res.status(400).json({ error: 'Faltan los parámetros "to" o "text"' });
    }
    try {
        // El formato del número debe ser '56912345678@c.us'
        const chatId = `${to}@c.us`;
        await client.sendMessage(chatId, text);
        res.status(200).json({ success: true, message: 'Mensaje enviado' });
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => console.log(`Servidor Express escuchando en el puerto ${PORT}`));

// --- 5. EVENTOS DEL CLIENTE DE WHATSAPP ---
client.on('qr', qr => {
    console.log('QR RECIBIDO, ESCANEA POR FAVOR.');
    qrcode.generate(qr);
});
client.on('ready', () => console.log('¡CLIENTE DE WHATSAPP LISTO!'));
client.on('message', async message => {
    console.log(`Mensaje recibido de: ${message.from}`);
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) return;
    try {
        // Extraemos solo el número, sin el '@c.us'
        const fromNumber = message.from.split('@')[0];
        await axios.post(n8nWebhookUrl, { from: fromNumber, text: message.body });
    } catch (error) {
        console.error(`Error al enviar el webhook a n8n: ${error.message}`);
    }
});

// --- 6. INICIAR EL CLIENTE ---
client.initialize().catch(err => console.error("Error al inicializar el cliente:", err));
