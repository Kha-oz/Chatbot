const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
require('dotenv').config()

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
//const MockAdapter = require('@bot-whatsapp/database/mock')
const MongoAdapter = require('@bot-whatsapp/database/mongo')
const { MongoClient } = require('mongodb')

const path = require('path')
const fs = require('fs')
const chat = require('./ChatGPT.js')
const { handlerAI } = require('./whisper.js')

// Agregar librería para eliminar acentos
const removeAccents = require('remove-accents')

// Leer archivos de texto de forma segura
function safeReadTxt(filePath, fallback) {
    try {
        return fs.readFileSync(path.join(__dirname, "mensajes", filePath), 'utf-8')
    } catch (e) {
        return fallback || 'Mensaje no disponible en este momento.'
    }
}

const menu = safeReadTxt("menu.txt", "Bienvenido a Smartcell Academy. ¿En qué podemos ayudarte hoy?");
const promptConsultas = safeReadTxt("promptConsultas.txt", "Haz tu consulta.");
const cursoText = safeReadTxt("curso.txt", "Nuestros cursos están diseñados para ti.");
const reparacionesText = safeReadTxt("reparaciones.txt", "Ofrecemos servicios de reparación profesional.");
const tiendaText = safeReadTxt("tienda.txt", "Bienvenido a nuestra tienda técnica.");

const opcionesValidas = ["1", "2", "3", "4", "0"]

// Conexión personalizada a MongoDB para consultas de productos/servicios
let db
(async () => {
    const client = new MongoClient(process.env.MONGO_DB_URI, { useUnifiedTopology: true })
    await client.connect()
    db = client.db('whatsappTEST') // Cambia si tu base real tiene otro nombre
})()

// Buscar ítem en MongoDB (mejorado para variantes)
async function buscarItem(mensaje) {
    if (!db) return null
    const texto = removeAccents(mensaje.trim().toLowerCase())
    // Busca en cursos
    let item = await db.collection('cursos').findOne({ nombre: { $regex: texto, $options: 'i' } })
    if (item) return { tipo: 'curso', ...item }
    // Busca en reparaciones
    item = await db.collection('reparaciones').findOne({ nombre: { $regex: texto, $options: 'i' } })
    if (item) return { tipo: 'reparacion', ...item }
    // Busca en herramientas
    item = await db.collection('herramientas').findOne({ nombre: { $regex: texto, $options: 'i' } })
    if (item) return { tipo: 'herramienta', ...item }
    return null
}

// Detección de intención desde texto (mejorada)
const detectarIntencion = (text) => {
    const lower = removeAccents(text.toLowerCase())

    const intenciones = [
        { keywords: ["curso", "cursos", "clase", "brochure", "estudiar", "capacitacion"], flow: "curso" },
        { keywords: ["reparar", "reparacion", "falla", "arreglar", "celular", "pantalla", "laptop", "pc", "computadora"], flow: "reparaciones" },
        { keywords: ["comprar", "precio", "herramienta", "vender", "producto", "tienda", "multimetro", "kit", "soldadura"], flow: "tienda" },
        { keywords: ["consulta", "duda", "pregunta", "informacion", "ayuda", "soporte"], flow: "consultas" },
    ]

    for (const item of intenciones) {
        if (item.keywords.some(p => lower.includes(p))) {
            return item.flow
        }
    }

    return null
}

// FLOW: Cursos
const flowCurso = addKeyword(EVENTS.ACTION)
    .addAnswer(cursoText, { capture: true, buttons: [
        { body: "Ver menú" },
        { body: "Consultar" },
        { body: "Tienda" },
        { body: "Salir" },
    ] }, async (ctx, ctxFn) => {
        try {
            const input = ctx.body.trim();

            const brochures = {
                "1": {
                    nombre: "Reparación de Laptops y PCs",
                    archivo: path.join(__dirname, "mensajes/pdfs/Brochure_reparacion_de_computadoras.pdf"),
                },
                "2": {
                    nombre: "Reparación de Celulares y Tablets",
                    archivo: path.join(__dirname, "mensajes/pdfs/Brochure_de_reparacion_de_celulares.pdf"),
                },
                "3": {
                    nombre: "Electrónica",
                    archivo: path.join(__dirname, "mensajes/pdfs/Brochure_electronica.pdf"),
                },
                "4": {
                    nombre: "Robótica",
                    archivo: path.join(__dirname, "mensajes/pdfs/Brochure_robotica.pdf"),
                },
            }
            
            const brochure = brochures[input];

            if (!brochure || !fs.existsSync(brochure.archivo)) {
                return ctxFn.flowDynamic("❌ Opción no válida. Por favor escribe 1, 2, 3 o 4.");
            }

            await ctxFn.flowDynamic([
                {
                    body: `📄 Aquí tienes el brochure del curso *${brochure.nombre}*`,
                    media: brochure.archivo,
                }
            
            ])
            return await ctxFn.flowDynamic("¿Deseas consultar sobre otro curso?");
        } catch (error) {
            console.error("❌ Error al enviar el brochure:", error);
            await ctxFn.flowDynamic("Ocurrió un error al intentar enviarte el brochure. Intenta de nuevo más tarde.");
        }
    });

// FLOW: Reparaciones
const flowReparaciones = addKeyword(EVENTS.ACTION)
    .addAnswer(reparacionesText, { buttons: [
        { body: "Ver menú" },
        { body: "Consultar" },
        { body: "Tienda" },
        { body: "Salir" },
    ] })

// FLOW: Tienda
const flowTienda = addKeyword(EVENTS.ACTION)
    .addAnswer(tiendaText, { buttons: [
        { body: "Ver menú" },
        { body: "Consultar" },
        { body: "Ver cursos" },
        { body: "Salir" },
    ] })

// FLOW: Consultas
const flowConsultas = addKeyword(EVENTS.ACTION)
    .addAnswer("Haz una consulta", { capture: true, buttons: [
        { body: "Ver menú" },
        { body: "Ver cursos" },
        { body: "Tienda" },
        { body: "Salir" },
    ] }, async (ctx, ctxFn) => {
        const answer = await chat(promptConsultas, ctx.body);
        if (!answer?.content) {
            return await ctxFn.flowDynamic("❌ No se pudo generar una respuesta. Intenta nuevamente.");
        }
        await ctxFn.flowDynamic(answer.content);
    });

// FLOW: Nota de voz
const flowVoice = addKeyword(EVENTS.VOICE_NOTE).addAnswer("🎤 Procesando tu nota de voz....", null, async (ctx, ctxFn) => {
    const transcripcion  = await handlerAI(ctx);

    if (transcripcion === "ERROR") {
        return await ctxFn.flowDynamic("❌ Ocurrió un error al procesar tu nota de voz.");
    }

    const intencion = detectarIntencion(transcripcion);

    switch (intencion) {
        case "curso":
            return gotoFlow(flowCurso);
        case "reparaciones":
            return gotoFlow(flowReparaciones);
        case "tienda":
            return gotoFlow(flowTienda);
        case "consulta":
            return gotoFlow(flowConsultas);
        default:
            return await flowDynamic("🤖 No entendí tu mensaje. ¿Podrías reformularlo o escribir *menu*?");
    }
});

// FLOW: Bienvenida mejorado para detectar mensajes directos desde la web
const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAnswer(menu, { capture: true, buttons: [
        { body: "Ver cursos" },
        { body: "Reparaciones" },
        { body: "Consultar" },
        { body: "Tienda" },
        { body: "Salir" },
    ] }, async (ctx, {gotoFlow,fallBack,flowDynamic}) => {
        // Si el usuario llega con un mensaje personalizado (desde la web)
        if (ctx.body && ctx.body.length > 2) {
            const item = await buscarItem(ctx.body);
            if (item) {
                await flowDynamic([
                    { body: menu },
                    { body: `*${item.tipo.toUpperCase()}*: ${item.nombre}\n${item.descripcion || ''}\nPrecio: S/ ${item.precio || 'Consultar'}` },
                    { body: "¿Deseas más información, consultar sobre otro producto/servicio o ver el menú?", buttons: [
                        { body: "Consultar" },
                        { body: "Ver menú" },
                        { body: "Volver" },
                    ] }
                ]);
                return;
            }
        }
        // Normalizar para botones
        const normalized = removeAccents(ctx.body.toLowerCase());
        if (["ver cursos", "1"].includes(normalized)) return gotoFlow(flowCurso);
        if (["reparaciones", "2"].includes(normalized)) return gotoFlow(flowReparaciones);
        if (["consultar", "3"].includes(normalized)) return gotoFlow(flowConsultas);
        if (["tienda", "4"].includes(normalized)) return gotoFlow(flowTienda);
        if (["salir", "0"].includes(normalized)) return await flowDynamic("Gracias por tu visita. Puedes volver a escribir *Menu* cuando lo necesites.");
        return fallBack("Respuesta no válida, elige una opción del menú o usa los botones.");
    });

// FLOW: Menú (permite volver a mostrar el menú y reiniciar contexto)
const menuFlow = addKeyword("Menu").addAnswer(
    menu,
    { capture: true, buttons: [
        { body: "Ver cursos" },
        { body: "Reparaciones" },
        { body: "Consultar" },
        { body: "Tienda" },
        { body: "Salir" },
    ] },
    async (ctx, {gotoFlow,fallBack,flowDynamic}) => {
        const normalized = removeAccents(ctx.body.toLowerCase());
        if (["ver cursos", "1"].includes(normalized)) return gotoFlow(flowCurso);
        if (["reparaciones", "2"].includes(normalized)) return gotoFlow(flowReparaciones);
        if (["consultar", "3"].includes(normalized)) return gotoFlow(flowConsultas);
        if (["tienda", "4"].includes(normalized)) return gotoFlow(flowTienda);
        if (["salir", "0"].includes(normalized)) return await flowDynamic("Saliendo... Puedes volver a acceder a este menú escribiendo '*Menu*'");
        return fallBack("Respuesta no valida, elige una de las opciones del menu o usa los botones");
    }
)
    
// Inicialización del bot
const main = async () => {
    const adapterDB = new MongoAdapter({
        dbUri: process.env.MONGO_DB_URI,
        dbname: "whatsappTEST"
    })
    const adapterFlow = createFlow([flowWelcome, menuFlow, flowCurso, flowReparaciones, flowTienda, flowConsultas, flowVoice])   
    const adapterProvider = createProvider(BaileysProvider)

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()
}

main()