const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');

// 1. CONFIGURACIÓN DE EXPRESS (para que Render no suspenda el bot)
const app = express();
const PORT = process.env.PORT || 3000; // Render asigna el puerto automáticamente
app.get('/', (req, res) => {
  res.send('WhatsApp Bot está vivo y escuchando.'); // Endpoint de salud
});
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));

// 2. CONFIGURACIÓN DEL CLIENTE DE WHATSAPP
const client = new Client({
  authStrategy: new LocalAuth({
    // Ruta donde se guardará la sesión. '/data' es el disco persistente de Render.
    dataPath: '/data' 
  }),
  puppeteer: {
    // Requerido para ejecutarse en un entorno de servidor como Render
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

// 3. EVENTOS DEL CLIENTE DE WHATSAPP

// Cuando se genera el QR, no lo mostraremos en terminal, lo veremos en los logs de Render
client.on('qr', qr => {
    console.log('--------------------------------------------------');
    console.log('ESCANEAME! Ve los logs de Render para el QR Code.');
    console.log('--------------------------------------------------');
    // Usaremos una librería para mostrarlo en los logs si es necesario,
    // pero usualmente los logs de Render muestran el texto del QR directamente.
    const qrcode = require('qrcode-terminal');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('AUTENTICADO CORRECTAMENTE.');
});

client.on('ready', () => {
    console.log('¡CLIENTE LISTO Y CONECTADO!');
});

client.on('auth_failure', msg => {
    console.error('FALLO DE AUTENTICACIÓN', msg);
    // Podrías añadir lógica para reiniciar el proceso si falla.
});

// El evento más importante: cuando llega un mensaje
client.on('message', async message => {
    console.log(`Mensaje recibido de: ${message.from} -> "${message.body}"`);
    
    // URL de tu Webhook de n8n (la tomaremos de una variable de entorno)
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

    if (!n8nWebhookUrl) {
        return console.error("Error: La variable de entorno N8N_WEBHOOK_URL no está configurada.");
    }

    // Preparamos los datos para enviar a n8n
    const payload = {
        from: message.from,
        text: message.body
    };

    // Hacemos la petición POST al webhook de n8n
    try {
        await axios.post(n8nWebhookUrl, payload);
        console.log(`Mensaje de ${message.from} enviado a n8n.`);
    } catch (error) {
        console.error(`Error al enviar el webhook a n8n: ${error.message}`);
    }
});

// Iniciar el cliente de WhatsApp
client.initialize();
