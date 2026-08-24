// ============================================
// CONFIGURACIÓN INICIAL
// ============================================
const DB_NAME = 'PresupuestoDB';
const DB_VERSION = 5; // ← Nueva versión
let db = null;

const CATEGORIAS = {
    INGRESOS: 'INGRESOS',
    GASTOS_ESENCIALES: 'GASTOS_ESENCIALES',
    GASTOS_DISCRECIONALES: 'GASTOS_DISCRECIONALES',
    PAGO_DEUDAS: 'PAGO_DEUDAS',
    AHORROS: 'AHORROS',
    INVERSIONES: 'INVERSIONES'
};

// ============================================
// BASE DE DATOS (IndexedDB)
// ============================================
function abrirDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // --- Stores existentes ---
            if (!db.objectStoreNames.contains('presupuesto')) {
                const store = db.createObjectStore('presupuesto', { keyPath: 'id', autoIncrement: true });
                store.createIndex('categoria', 'categoria', { unique: false });
                store.createIndex('subcategoria', 'subcategoria', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('transacciones')) {
                const store = db.createObjectStore('transacciones', { keyPath: 'id', autoIncrement: true });
                store.createIndex('mes', 'mes', { unique: false });
                store.createIndex('anio', 'anio', { unique: false });
                store.createIndex('categoria', 'categoria', { unique: false });
                store.createIndex('subcategoria', 'subcategoria', { unique: false });
                store.createIndex('tarjetaId', 'tarjetaId', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('patrimonio')) {
                const store = db.createObjectStore('patrimonio', { keyPath: 'id', autoIncrement: true });
                store.createIndex('mes', 'mes', { unique: false });
                store.createIndex('tipo', 'tipo', { unique: false });
            }
            
            if (!db.objectStoreNames.contains('configuracion')) {
                db.createObjectStore('configuracion', { keyPath: 'key' });
            }

            if (!db.objectStoreNames.contains('subcategorias')) {
                const store = db.createObjectStore('subcategorias', { keyPath: 'id', autoIncrement: true });
                store.createIndex('categoria', 'categoria', { unique: false });
                store.createIndex('nombre', 'nombre', { unique: false });
            }

            // ============ NUEVO: TARJETAS DE CRÉDITO ============
            if (!db.objectStoreNames.contains('tarjetas')) {
                const store = db.createObjectStore('tarjetas', { keyPath: 'id', autoIncrement: true });
                store.createIndex('nombre', 'nombre', { unique: false });
            }

            // ============ NUEVO: GASTOS FIJOS ============
            if (!db.objectStoreNames.contains('gastosFijos')) {
                const store = db.createObjectStore('gastosFijos', { keyPath: 'id', autoIncrement: true });
                store.createIndex('categoria', 'categoria', { unique: false });
                store.createIndex('frecuencia', 'frecuencia', { unique: false });
            }
        };
    });
}

// ============================================
// CONFIGURACIÓN
// ============================================
async function guardarConfiguracion(key, value) {
    const tx = db.transaction('configuracion', 'readwrite');
    const store = tx.objectStore('configuracion');
    return new Promise((resolve, reject) => {
        const req = store.put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function obtenerConfiguracion(key) {
    const tx = db.transaction('configuracion', 'readonly');
    const store = tx.objectStore('configuracion');
    return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => reject(req.error);
    });
}

// ============================================
// ============ TARJETAS DE CRÉDITO ============
// ============================================

// Guardar o actualizar una tarjeta
async function guardarTarjeta({ id, nombre, diaCorte, diaPago, deudaActual = 0 }) {
    const tx = db.transaction('tarjetas', 'readwrite');
    const store = tx.objectStore('tarjetas');
    
    const data = { nombre, diaCorte, diaPago, deudaActual };
    if (id) data.id = id;
    
    return new Promise((resolve, reject) => {
        const req = id ? store.put(data) : store.add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Obtener todas las tarjetas
async function obtenerTarjetas() {
    const tx = db.transaction('tarjetas', 'readonly');
    const store = tx.objectStore('tarjetas');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Eliminar una tarjeta
async function eliminarTarjeta(id) {
    const tx = db.transaction('tarjetas', 'readwrite');
    const store = tx.objectStore('tarjetas');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Calcular deuda total de una tarjeta (basado en transacciones)
async function calcularDeudaTarjeta(tarjetaId, mesActual, anioActual) {
    const tx = db.transaction('transacciones', 'readonly');
    const store = tx.objectStore('transacciones');
    const index = store.index('tarjetaId');
    
    return new Promise((resolve, reject) => {
        const req = index.getAll(tarjetaId);
        req.onsuccess = () => {
            const transacciones = req.result;
            // Sumar solo las que no han sido pagadas (podemos agregar un campo "pagado")
            const total = transacciones.reduce((sum, t) => sum + t.monto, 0);
            resolve(total);
        };
        req.onerror = () => reject(req.error);
    });
}

// Obtener gastos de una tarjeta por mes (para historial)
async function obtenerGastosTarjetaPorMes(tarjetaId, mes, anio) {
    const tx = db.transaction('transacciones', 'readonly');
    const store = tx.objectStore('transacciones');
    const index = store.index('tarjetaId');
    
    return new Promise((resolve, reject) => {
        const req = index.getAll(tarjetaId);
        req.onsuccess = () => {
            const transacciones = req.result.filter(t => t.mes === mes && t.anio === anio);
            resolve(transacciones);
        };
        req.onerror = () => reject(req.error);
    });
}

// ============================================
// ============ GASTOS FIJOS ============
// ============================================

// Guardar un gasto fijo
async function guardarGastoFijo({ id, nombre, monto, categoria, subcategoria, diaPago, frecuencia = 'mensual' }) {
    const tx = db.transaction('gastosFijos', 'readwrite');
    const store = tx.objectStore('gastosFijos');
    
    const data = { nombre, monto, categoria, subcategoria, diaPago, frecuencia };
    if (id) data.id = id;
    
    return new Promise((resolve, reject) => {
        const req = id ? store.put(data) : store.add(data);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Obtener todos los gastos fijos
async function obtenerGastosFijos() {
    const tx = db.transaction('gastosFijos', 'readonly');
    const store = tx.objectStore('gastosFijos');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// Eliminar un gasto fijo
async function eliminarGastoFijo(id) {
    const tx = db.transaction('gastosFijos', 'readwrite');
    const store = tx.objectStore('gastosFijos');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// Obtener gastos fijos que vencen en los próximos X días
async function obtenerGastosFijosProximos(dias = 7) {
    const gastos = await obtenerGastosFijos();
    const hoy = new Date();
    const diaActual = hoy.getDate();
    const mesActual = hoy.getMonth() + 1;
    
    return gastos.filter(g => {
        let diasHastaPago = g.diaPago - diaActual;
        if (diasHastaPago < 0) {
            // Si el día ya pasó este mes, calcular para el próximo mes
            diasHastaPago = g.diaPago + (new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - diaActual);
        }
        return diasHastaPago <= dias && diasHastaPago >= 0;
    });
}

// ============================================
// ============ SUBCATEGORÍAS ============
// ============================================

async function guardarSubcategoria(categoria, nombre, monto = 0) {
    const tx = db.transaction(['subcategorias', 'presupuesto'], 'readwrite');
    const subStore = tx.objectStore('subcategorias');
    
    const index = subStore.index('nombre');
    return new Promise((resolve, reject) => {
        const req = index.get(nombre);
        req.onsuccess = () => {
            const existing = req.result;
            if (existing) {
                existing.categoria = categoria;
                const updateReq = subStore.put(existing);
                updateReq.onsuccess = () => resolve(updateReq.result);
                updateReq.onerror = () => reject(updateReq.error);
            } else {
                const newItem = { categoria, nombre, monto: monto || 0 };
                const addReq = subStore.add(newItem);
                addReq.onsuccess = () => {
                    guardarPresupuesto(categoria, nombre, monto || 0);
                    resolve(addReq.result);
                };
                addReq.onerror = () => reject(addReq.error);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

async function obtenerSubcategorias() {
    const tx = db.transaction('subcategorias', 'readonly');
    const store = tx.objectStore('subcategorias');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function eliminarSubcategoria(id) {
    const tx = db.transaction(['subcategorias', 'presupuesto'], 'readwrite');
    const subStore = tx.objectStore('subcategorias');
    const getReq = subStore.get(id);
    
    return new Promise((resolve, reject) => {
        getReq.onsuccess = () => {
            const item = getReq.result;
            if (!item) { resolve(); return; }
            
            const deleteReq = subStore.delete(id);
            deleteReq.onsuccess = () => {
                const presStore = tx.objectStore('presupuesto');
                const index = presStore.index('subcategoria');
                const presReq = index.get(item.nombre);
                presReq.onsuccess = () => {
                    const presItem = presReq.result;
                    if (presItem) presStore.delete(presItem.id);
                    resolve();
                };
                presReq.onerror = () => reject(presReq.error);
            };
            deleteReq.onerror = () => reject(deleteReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

async function inicializarSubcategorias() {
    const existentes = await obtenerSubcategorias();
    if (existentes.length > 0) return;
    
    const defaults = [
        { categoria: 'INGRESOS', nombre: 'Sueldo', monto: 3200 },
        { categoria: 'INGRESOS', nombre: 'Freelance', monto: 0 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Renta', monto: 1025 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Super', monto: 200 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Aseguranza carro', monto: 95 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Celular', monto: 104 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Gasolina', monto: 100 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Laptop', monto: 50 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Internet', monto: 70 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Mama', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'Gastos variables', monto: 100 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Free', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Aeroméxico', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC América express', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Nu', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Volaris Invex', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Mercado Pago', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'Tj Maxx', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Discovery', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Gap', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'After Pay', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'Taxes', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC AE $', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'LUZ HERMISTON', monto: 0 },
        { categoria: 'PAGO_DEUDAS', nombre: 'Solares', monto: 550 },
        { categoria: 'PAGO_DEUDAS', nombre: 'Abono extra solar', monto: 0 },
        { categoria: 'AHORROS', nombre: 'Ahorro USA', monto: 400 },
        { categoria: 'AHORROS', nombre: 'Ahorro MX', monto: 400 },
        { categoria: 'INVERSIONES', nombre: 'Inversión', monto: 0 }
    ];
    
    for (const item of defaults) {
        await guardarSubcategoria(item.categoria, item.nombre, item.monto);
    }
}

// ============================================
// FUNCIONES CRUD (Transacciones)
// ============================================
async function guardarTransaccion({ mes, anio, categoria, subcategoria, fecha, monto, notas, revisado, tarjetaId = null }) {
    const tx = db.transaction('transacciones', 'readwrite');
    const store = tx.objectStore('transacciones');
    const newItem = { 
        mes, anio, categoria, subcategoria, fecha, monto, 
        notas: notas || '', 
        revisado: revisado || false,
        tarjetaId: tarjetaId || null
    };
    return new Promise((resolve, reject) => {
        const req = store.add(newItem);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function obtenerTransacciones(mes, anio) {
    const tx = db.transaction('transacciones', 'readonly');
    const store = tx.objectStore('transacciones');
    const index = store.index('mes');
    return new Promise((resolve, reject) => {
        const req = index.getAll(mes);
        req.onsuccess = () => {
            const resultados = req.result.filter(t => t.anio === anio);
            resolve(resultados);
        };
        req.onerror = () => reject(req.error);
    });
}

async function obtenerTodasTransacciones() {
    const tx = db.transaction('transacciones', 'readonly');
    const store = tx.objectStore('transacciones');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function eliminarTransaccion(id) {
    const tx = db.transaction('transacciones', 'readwrite');
    const store = tx.objectStore('transacciones');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ============================================
// FUNCIONES CRUD (Patrimonio)
// ============================================
async function guardarPatrimonio({ mes, tipo, subcategoria, monto }) {
    const tx = db.transaction('patrimonio', 'readwrite');
    const store = tx.objectStore('patrimonio');
    const newItem = { mes, tipo, subcategoria, monto };
    return new Promise((resolve, reject) => {
        const req = store.add(newItem);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function obtenerPatrimonio(mes) {
    const tx = db.transaction('patrimonio', 'readonly');
    const store = tx.objectStore('patrimonio');
    const index = store.index('mes');
    return new Promise((resolve, reject) => {
        const req = index.getAll(mes);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function eliminarPatrimonio(id) {
    const tx = db.transaction('patrimonio', 'readwrite');
    const store = tx.objectStore('patrimonio');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ============================================
// FUNCIONES DE CÁLCULO
// ============================================
function calcularTotalesPorCategoria(transacciones) {
    const totales = {};
    for (const cat in CATEGORIAS) {
        totales[CATEGORIAS[cat]] = 0;
    }
    
    transacciones.forEach(t => {
        const categoria = t.categoria;
        if (totales[categoria] !== undefined) {
            totales[categoria] += t.monto;
        }
    });
    
    return totales;
}

function calcularRemanente(transacciones) {
    const totales = calcularTotalesPorCategoria(transacciones);
    const ingresos = totales[CATEGORIAS.INGRESOS] || 0;
    const gastos = (totales[CATEGORIAS.GASTOS_ESENCIALES] || 0) +
                   (totales[CATEGORIAS.GASTOS_DISCRECIONALES] || 0) +
                   (totales[CATEGORIAS.PAGO_DEUDAS] || 0) +
                   (totales[CATEGORIAS.AHORROS] || 0) +
                   (totales[CATEGORIAS.INVERSIONES] || 0);
    return ingresos - gastos;
}

function calcularPatrimonioNeto(activos, pasivos) {
    const totalActivos = activos.reduce((sum, a) => sum + a.monto, 0);
    const totalPasivos = pasivos.reduce((sum, p) => sum + p.monto, 0);
    return totalActivos - totalPasivos;
}

// ============================================
// ============ NOTIFICACIONES ============
// ============================================

// Función para enviar notificaciones
function enviarNotificacion(titulo, mensaje, icono = '💰') {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(titulo, {
            body: mensaje,
            icon: 'assets/icons/icon-192.png',
            tag: 'recordatorio'
        });
    }
}

// Función para verificar y enviar recordatorios
async function verificarRecordatorios() {
    const hoy = new Date();
    const diaActual = hoy.getDate();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();
    
    // 1. Verificar pagos de tarjetas
    const tarjetas = await obtenerTarjetas();
    for (const tarjeta of tarjetas) {
        const diasHastaPago = tarjeta.diaPago - diaActual;
        const deuda = await calcularDeudaTarjeta(tarjeta.id, mesActual, anioActual);
        
        // Notificación 3 días antes
        if (diasHastaPago === 3 && deuda > 0) {
            enviarNotificacion(
                `💳 ${tarjeta.nombre} vence en 3 días`,
                `Debes $${deuda.toFixed(2)}. Pago el día ${tarjeta.diaPago}`
            );
        }
        
        // Notificación 1 día antes
        if (diasHastaPago === 1 && deuda > 0) {
            enviarNotificacion(
                `⚠️ ¡Mañana vence ${tarjeta.nombre}!`,
                `Tienes que pagar $${deuda.toFixed(2)}`
            );
        }
        
        // Notificación el día del pago
        if (diasHastaPago === 0 && deuda > 0) {
            enviarNotificacion(
                `📢 ¡Hoy vence ${tarjeta.nombre}!`,
                `Paga $${deuda.toFixed(2)} antes de que termine el día`
            );
        }

        // Notificación semanal: división del pago
        if (diasHastaPago > 0 && diasHastaPago <= 7 && deuda > 0) {
            const semanasRestantes = Math.ceil(diasHastaPago / 7);
            const pagoSemanal = deuda / semanasRestantes;
            enviarNotificacion(
                `📊 ${tarjeta.nombre} - Pago semanal`,
                `Te toca pagar $${pagoSemanal.toFixed(2)} esta semana (${semanasRestantes} semanas restantes)`
            );
        }
    }
    
    // 2. Verificar gastos fijos
    const gastosFijos = await obtenerGastosFijos();
    for (const gasto of gastosFijos) {
        const diasHastaPago = gasto.diaPago - diaActual;
        
        if (diasHastaPago === 3) {
            enviarNotificacion(
                `🔔 ${gasto.nombre} vence en 3 días`,
                `Debes pagar $${gasto.monto.toFixed(2)}`
            );
        }
        
        if (diasHastaPago === 0) {
            enviarNotificacion(
                `📢 ¡Hoy vence ${gasto.nombre}!`,
                `Paga $${gasto.monto.toFixed(2)}`
            );
        }
    }
}

// ============================================
// UTILIDADES
// ============================================
function formatearMoneda(valor, moneda = '$') {
    return moneda + ' ' + valor.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function obtenerNombreMes(mes) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes - 1];
}

// ============================================
// EXPORTAR
// ============================================
window.app = {
    db,
    abrirDB,
    guardarConfiguracion,
    obtenerConfiguracion,
    guardarPresupuesto,
    obtenerPresupuesto,
    eliminarPresupuesto,
    guardarTransaccion,
    obtenerTransacciones,
    obtenerTodasTransacciones,
    eliminarTransaccion,
    guardarPatrimonio,
    obtenerPatrimonio,
    eliminarPatrimonio,
    guardarSubcategoria,
    obtenerSubcategorias,
    eliminarSubcategoria,
    inicializarSubcategorias,
    // Nuevas funciones
    guardarTarjeta,
    obtenerTarjetas,
    eliminarTarjeta,
    calcularDeudaTarjeta,
    obtenerGastosTarjetaPorMes,
    guardarGastoFijo,
    obtenerGastosFijos,
    eliminarGastoFijo,
    obtenerGastosFijosProximos,
    verificarRecordatorios,
    enviarNotificacion,
    calcularTotalesPorCategoria,
    calcularRemanente,
    calcularPatrimonioNeto,
    formatearMoneda,
    obtenerNombreMes,
    CATEGORIAS
};

// ============================================
// INICIALIZAR RECORDATORIOS
// ============================================
// Cuando la app se abre, verificar notificaciones
document.addEventListener('DOMContentLoaded', async () => {
    // Pedir permiso para notificaciones
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Verificar recordatorios al cargar
    setTimeout(async () => {
        try {
            await window.app.verificarRecordatorios();
        } catch (e) {
            console.log('Error al verificar recordatorios:', e);
        }
    }, 2000);
});

// Verificar recordatorios cada 6 horas (21600000 ms)
setInterval(async () => {
    try {
        await window.app.verificarRecordatorios();
    } catch (e) {
        console.log('Error al verificar recordatorios:', e);
    }
}, 21600000);