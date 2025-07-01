const { createBot, createProvider, createFlow, addKeyword, EVENTS } = require('@bot-whatsapp/bot')
require('dotenv').config()

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
//const MockAdapter = require('@bot-whatsapp/database/mock')
const MongoAdapter = require('@bot-whatsapp/database/mongo')

const path = require('path')
const fs = require('fs')
const chat = require('./ChatGPT.js')
const { handlerAI } = require('./whisper.js')

// Leer archivos de texto
const readTxt = (filePath) => fs.readFileSync(path.join(__dirname, "mensajes", filePath), 'utf-8')

const menu = readTxt("menu.txt")
const promptConsultas = readTxt("promptConsultas.txt")
const cursoText = readTxt("curso.txt")
const reparacionesText = readTxt("reparaciones.txt")
const tiendaText = readTxt("tienda.txt")

const opcionesValidas = ["1", "2", "3", "4", "0"]

// Detección de intención desde texto
const detectarIntencion = (text) => {
    const lower = text.toLowerCase()

    const intenciones = [
        { keywords: ["curso", "cursos", "clase", "brochure", "estudiar"], flow: "curso" },
        { keywords: ["reparar", "reparación", "falla", "arreglar", "celular", "pantalla"], flow: "reparaciones" },
        { keywords: ["comprar", "precio", "herramienta", "vender", "producto", "tienda"], flow: "tienda" },
        { keywords: ["consulta", "duda", "pregunta", "información", "ayuda", "soporte"], flow: "consultas" },
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
    .addAnswer(cursoText, { capture: true }, async (ctx, ctxFn) => {
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
    .addAnswer(reparacionesText)

// FLOW: Tienda
const flowTienda = addKeyword(EVENTS.ACTION)
    .addAnswer(tiendaText) 
    
// FLOW: Consultas
const flowConsultas = addKeyword(EVENTS.ACTION)
    .addAnswer("Haz una consulta", {capture: true}, async (ctx, ctxFn) => {
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

// FLOW: Bienvenida
const flowWelcome = addKeyword(EVENTS.WELCOME)
    .addAnswer(menu, { capture: true }, async (ctx, {gotoFlow,fallBack,flowDynamic}) => {
        if (!opcionesValidas.includes(ctx.body)) {
            return fallBack("Respuesta no válida, elige una opción del menú.");
        }

        switch (ctx.body) {
            case "1":
                return gotoFlow(flowCurso);
            case "2":
                return gotoFlow(flowReparaciones);
            case "3":
                return gotoFlow(flowConsultas);
            case "4":
                return gotoFlow(flowTienda);
            case "0":
                return await flowDynamic("Gracias por tu visita. Puedes volver a escribir *Menu* cuando lo necesites.");
        }
});

// Comando para volver a mostrar el menú
const menuFlow = addKeyword("Menu").addAnswer(
    menu,
    { capture: true },
    async (ctx, ctxFn) => {
        if (!opcionesValidas.includes(ctx.body)) {
            return fallBack(
                "Respuesta no valida, elige una de las opciones del menu",
            )
        }
        switch (ctx.body) {
            case "1":
                return gotoFlow(flowCurso);
            case "2":
                return gotoFlow(flowReparaciones);
            case "3":
                return gotoFlow(flowConsultas);
            case "4":
                return gotoFlow(flowTienda);
            case "0":
                return await flowDynamic(
                    "Saliendo... Puedes volver a acceder a este menú escribiendo '*Menu*'"
                )
            }
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