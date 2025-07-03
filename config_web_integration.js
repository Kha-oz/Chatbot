// Configuración para integración con el chatbot de WhatsApp
// Usar en tu proyecto web: https://github.com/Kha-oz/smartcell-academy

const WHATSAPP_CONFIG = {
    // REEMPLAZA CON TU NÚMERO REAL DEL BOT
    numero: '51999999999',
    
    // Función para generar enlaces de WhatsApp
    generarEnlace: function(tipo, nombre) {
        const mensaje = `web_smartcell:${tipo}:${nombre}`;
        return `https://wa.me/${this.numero}?text=${encodeURIComponent(mensaje)}`;
    },
    
    // Función para abrir WhatsApp
    abrirWhatsApp: function(tipo, nombre) {
        const url = this.generarEnlace(tipo, nombre);
        window.open(url, '_blank');
    }
};

// Ejemplos de uso:

// 1. En React/Next.js:
/*
function BotonWhatsApp({ tipo, nombre, children }) {
    return (
        <button onClick={() => WHATSAPP_CONFIG.abrirWhatsApp(tipo, nombre)}>
            {children}
        </button>
    );
}

// Uso:
<BotonWhatsApp tipo="curso" nombre="Reparación de Celulares">
    Más Información
</BotonWhatsApp>
*/

// 2. En HTML puro:
/*
<a href="javascript:void(0)" onclick="WHATSAPP_CONFIG.abrirWhatsApp('curso', 'Reparación de Celulares')">
    Más Información
</a>
*/

// 3. Enlaces directos:
/*
<a href="https://wa.me/51999999999?text=web_smartcell:curso:Reparación%20de%20Celulares">
    Más Información
</a>
*/

// Tipos disponibles:
// - 'curso' - Para cursos
// - 'reparacion' - Para servicios de reparación  
// - 'herramienta' - Para herramientas/productos

// Nombres de ejemplo (ajustar según tu base de datos):
// Cursos: 'Reparación de Celulares', 'Electrónica Básica', 'Reparación de Computadoras'
// Reparaciones: 'Cambio de Pantalla', 'Reparación de Batería', 'Reparación de Software'
// Herramientas: 'Multímetro Digital', 'Kit de Destornilladores', 'Estación de Soldadura'

// Exportar para uso en módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WHATSAPP_CONFIG;
} 