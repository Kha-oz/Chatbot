const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
require('dotenv').config()

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MongoAdapter = require('@bot-whatsapp/database/mongo')
const { MongoClient } = require('mongodb')
const removeAccents = require('remove-accents')

// Conexión a MongoDB
let db
;(async () => {
    try {
        const client = new MongoClient(process.env.MONGO_DB_URI, { useUnifiedTopology: true })
        await client.connect()
        db = client.db('test')
        console.log('✅ MongoDB conectado');
    } catch (error) {
        console.error('❌ Error MongoDB:', error);
        db = null;
    }
})()

// Buscar ítem en MongoDB
async function buscarItem(mensaje) {
    if (!db) return null
    const texto = removeAccents(mensaje.trim().toLowerCase())
    
    // Buscar en todas las colecciones
    const colecciones = ['cursos', 'reparaciones', 'herramientas']
    const tipos = ['curso', 'reparacion', 'herramienta']
    
    for (let i = 0; i < colecciones.length; i++) {
        const item = await db.collection(colecciones[i]).findOne({ 
            nombre: { $regex: texto, $options: 'i' } 
        })
        if (item) return { tipo: tipos[i], ...item }
    }
    return null
}

// Obtener y formatear datos
async function obtenerDatos(coleccion, titulo) {
    if (!db) return "No hay conexión a la base de datos."
    
    try {
        const datos = await db.collection(coleccion).find({}).toArray()
        if (!datos.length) return `No hay ${titulo} disponibles.`
        
        let mensaje = `📋 *${titulo}:*\n\n`
        datos.forEach((item, idx) => {
            mensaje += `${idx + 1}. *${item.nombre}*`
            if (item.precio) mensaje += ` - S/ ${item.precio}`
            if (item.duracion) mensaje += ` - ${item.duracion}`
            mensaje += '\n'
        })
        mensaje += '\n⏰ *Un asesor se comunicará contigo pronto.*'
        return mensaje
    } catch (error) {
        console.error(`Error en ${coleccion}:`, error)
        return `Error al obtener ${titulo}.`
    }
}

// Registrar historial
async function registrarHistory(from, origen) {
    if (!db) return
    try {
        await db.collection('history').updateOne(
            { from },
            { $set: { from, origen, fecha: new Date() } },
            { upsert: true }
        )
    } catch (error) {
        console.error('Error registrando history:', error)
    }
}

// FLOW: Usuarios desde la web de SmartCell
const flowWebSmartCell = addKeyword(['web_smartcell', 'smartcell_web', 'desde_web', 'smartcell', 'academy_web', 'web_academy'])
    .addAnswer(async (ctx, ctxFn) => {
        console.log('🌐 Usuario desde web:', ctx.body)
        
        try {
            const partes = ctx.body.split(':')
            if (partes.length >= 3) {
                const tipo = partes[1]
                const nombre = partes[2]
                const item = await buscarItem(nombre)
                
                if (item) {
                    let mensaje = `*${item.tipo.toUpperCase()} SELECCIONADO:*\n\n`
                    mensaje += `*${item.nombre}*\n`
                    if (item.descripcion) mensaje += `${item.descripcion}\n`
                    if (item.precio) mensaje += `Precio: S/ ${item.precio}\n`
                    if (item.duracion) mensaje += `Duración: ${item.duracion}\n`
                    mensaje += `\n✅ *¡Perfecto! Has seleccionado este ${item.tipo}.*\n\n`
                    mensaje += `⏰ *En unos momentos un asesor se comunicará contigo.*\n\n`
                    mensaje += `📞 *Mientras tanto:*\n• Escribe "menu" para más opciones\n• Escribe "consultar" para preguntas\n• Espera a que nuestro asesor te contacte`
                    
                    await ctxFn.flowDynamic(mensaje)
                    await registrarHistory(ctx.from, `web_${item.tipo}`)
                } else {
                    await ctxFn.flowDynamic([
                        "✅ *¡Gracias por tu interés en SmartCell Academy!*",
                        "⏰ *En unos momentos un asesor se comunicará contigo.*",
                        "📞 *Mientras tanto:*\n• Escribe \"menu\" para ver opciones\n• Escribe \"consultar\" para preguntas\n• Espera a que nuestro asesor te contacte"
                    ])
                    await registrarHistory(ctx.from, 'web_generico')
                }
            } else {
                await ctxFn.flowDynamic([
                    "✅ *¡Bienvenido desde SmartCell Academy!*",
                    "⏰ *En unos momentos un asesor se comunicará contigo.*",
                    "📞 *Mientras tanto:*\n• Escribe \"menu\" para ver opciones\n• Escribe \"consultar\" para preguntas\n• Espera a que nuestro asesor te contacte"
                ])
                await registrarHistory(ctx.from, 'web_bienvenida')
            }
        } catch (error) {
            console.error('Error en flowWebSmartCell:', error)
            await ctxFn.flowDynamic("Error. Escribe 'menu' para ver opciones.")
        }
    })

// FLOW: Cursos
const flowCurso = addKeyword(['cursos', 'curso', '1', 'ver cursos'])
    .addAnswer(async (ctx, ctxFn) => {
        const mensaje = await obtenerDatos('cursos', 'Nuestros cursos disponibles')
        await ctxFn.flowDynamic(mensaje)
    })

// FLOW: Reparaciones
const flowReparaciones = addKeyword(['reparaciones', 'reparar', '2', 'arreglar'])
    .addAnswer(async (ctx, ctxFn) => {
        const mensaje = await obtenerDatos('reparaciones', 'Servicios de reparación')
        await ctxFn.flowDynamic(mensaje)
    })

// FLOW: Tienda
const flowTienda = addKeyword(['tienda', 'herramientas', '4', 'comprar'])
    .addAnswer(async (ctx, ctxFn) => {
        const mensaje = await obtenerDatos('herramientas', 'Herramientas disponibles')
        await ctxFn.flowDynamic(mensaje)
    })

// FLOW: Consultas
const flowConsultas = addKeyword(['consultar', 'consulta', '3', 'pregunta', 'duda'])
    .addAnswer('Por favor, escribe tu consulta y un asesor te contactará pronto.\n\nEscribe "menu" para volver al menú principal.', 
        { capture: true }, 
        async (ctx, ctxFn) => {
            console.log('📝 Consulta recibida:', ctx.body)
            await ctxFn.flowDynamic('¡Gracias! Tu consulta ha sido enviada a un asesor.')
        })

// FLOW: Bienvenida
const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAnswer('Bienvenido a Smartcell Academy. ¿En qué podemos ayudarte?\n\n1. Cursos\n2. Reparaciones\n3. Consultar\n4. Tienda\n0. Salir', 
        { capture: true }, 
        async (ctx, {flowDynamic}) => {
            await registrarHistory(ctx.from, 'bienvenida')
            
            const normalized = removeAccents(ctx.body.toLowerCase())
            
            if (["1", "cursos", "curso"].includes(normalized)) {
                const mensaje = await obtenerDatos('cursos', 'Nuestros cursos disponibles')
                await flowDynamic(mensaje)
            } else if (["2", "reparaciones", "reparar"].includes(normalized)) {
                const mensaje = await obtenerDatos('reparaciones', 'Servicios de reparación')
                await flowDynamic(mensaje)
            } else if (["3", "consultar", "consulta"].includes(normalized)) {
                await flowDynamic('Haz una consulta.\n\nEscribe "menu" para volver al menú principal.')
            } else if (["4", "tienda", "herramientas"].includes(normalized)) {
                const mensaje = await obtenerDatos('herramientas', 'Herramientas disponibles')
                await flowDynamic(mensaje)
            } else if (["0", "salir"].includes(normalized)) {
                await flowDynamic("Gracias por tu visita. Escribe *menu* cuando lo necesites.")
            } else {
                await flowDynamic("Opción no válida. Elige 1, 2, 3, 4 o 0.")
            }
        })

// FLOW: Saludos
const flowSaludos = addKeyword(['hola', 'buenos días', 'buenas', 'hello', 'hi', 'hey'])
    .addAnswer('¡Hola! Bienvenido a Smartcell Academy.\n\n1. Cursos\n2. Reparaciones\n3. Consultar\n4. Tienda\n0. Salir')

// FLOW: Menú global
const menuGlobalFlow = addKeyword(['menu', 'Menu', 'MENU'])
    .addAnswer('Menú principal:\n\n1. Cursos\n2. Reparaciones\n3. Consultar\n4. Tienda\n0. Salir',
        { capture: true },
        async (ctx, {flowDynamic}) => {
            await registrarHistory(ctx.from, 'menu')
            const normalized = removeAccents(ctx.body.toLowerCase())
            
            if (["1", "cursos", "curso"].includes(normalized)) {
                const mensaje = await obtenerDatos('cursos', 'Nuestros cursos disponibles')
                await flowDynamic(mensaje)
            } else if (["2", "reparaciones", "reparar"].includes(normalized)) {
                const mensaje = await obtenerDatos('reparaciones', 'Servicios de reparación')
                await flowDynamic(mensaje)
            } else if (["3", "consultar", "consulta"].includes(normalized)) {
                await flowDynamic('Haz una consulta.\n\nEscribe "menu" para volver al menú principal.')
            } else if (["4", "tienda", "herramientas"].includes(normalized)) {
                const mensaje = await obtenerDatos('herramientas', 'Herramientas disponibles')
                await flowDynamic(mensaje)
            } else if (["0", "salir"].includes(normalized)) {
                await flowDynamic("Saliendo... Escribe '*Menu*' para volver.")
            } else {
                await flowDynamic("Opción no válida. Elige 1, 2, 3, 4 o 0.")
            }
        })

// FLOW: Fallback
const fallbackFlow = addKeyword(EVENTS.ACTION)
    .addAnswer("No entendí tu mensaje. Escribe:\n• 1 o cursos\n• 2 o reparaciones\n• 3 o consultar\n• 4 o tienda\n• menu para el menú\n• 0 para salir")

// Inicialización del bot
const main = async () => {
    const adapterDB = new MongoAdapter({
        dbUri: process.env.MONGO_DB_URI,
        dbname: "whatsappTEST"
    })
    
    const adapterFlow = createFlow([
        flowWebSmartCell, 
        flowWelcome, 
        flowSaludos, 
        menuGlobalFlow, 
        flowCurso, 
        flowReparaciones, 
        flowTienda, 
        flowConsultas, 
        fallbackFlow
    ])
    
    const adapterProvider = createProvider(BaileysProvider, {
        printQRInTerminal: true,
        auth: { creds: {}, keys: {} },
        connectTimeoutMs: 60000,
        qrTimeout: 60000,
        defaultQueryTimeoutMs: 60000,
        retryRequestDelayMs: 1000,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        browser: ['Smartcell Academy Bot', 'Chrome', '1.0.0'],
        version: [2, 2323, 4],
        logger: { level: 'error' },
        shouldIgnoreJid: jid => jid.includes('@broadcast'),
        patchMessageBeforeSending: (msg) => {
            const requiresPatch = !!(msg.buttonsMessage || msg.templateMessage || msg.listMessage)
            if (requiresPatch) {
                msg = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...msg,
                        },
                    },
                }
            }
            return msg
        },
    })

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb({ port: 5001 })
}

main()

// Manejo de errores
process.on('uncaughtException', (err) => {
    console.error('❌ Excepción no capturada:', err.message)
})

process.on('unhandledRejection', (reason) => {
    if (reason && reason.message && 
        (reason.message.includes('Timed Out') || reason.message.includes('connection'))) {
        return
    }
    console.error('❌ Rechazo de promesa:', reason)
})

process.on('SIGINT', () => {
    console.log('🛑 Cerrando bot...')
    process.exit(0)
})

process.on('SIGTERM', () => {
    console.log('🛑 Cerrando bot...')
    process.exit(0)
})