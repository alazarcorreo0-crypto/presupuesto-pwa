// ============================================
// CONFIGURACIÓN INICIAL
// ============================================
const DB_NAME = 'PresupuestoDB';
const DB_VERSION = 6; // Subimos a versión 6 para forzar reinicio
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
// ABRIR BASE DE DATOS
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
            
            // STORES EXISTENTES
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

            // ============ NUEVOS STORES ============
            if (!db.objectStoreNames.contains('tarjetas')) {
                const store = db.createObjectStore('tarjetas', { keyPath: 'id', autoIncrement: true });
                store.createIndex('nombre', 'nombre', { unique: false });
            }

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
// FUNCIONES CRUD (Presupuesto)
// ============================================
async function guardarPresupuesto(categoria, subcategoria, monto) {
    const tx = db.transaction('presupuesto', 'readwrite');
    const store = tx.objectStore('presupuesto');
    const index = store.index('subcategoria');
    
    return new Promise((resolve, reject) => {
        const req = index.get(subcategoria);
        req.onsuccess = () => {
            const existing = req.result;
            if (existing) {
                existing.monto = monto;
                const updateReq = store.put(existing);
                updateReq.onsuccess = () => resolve(updateReq.result);
                updateReq.onerror = () => reject(updateReq.error);
            } else {
                const newItem = { categoria, subcategoria, monto };
                const addReq = store.add(newItem);
                addReq.onsuccess = () => resolve(addReq.result);
                addReq.onerror = () => reject(addReq.error);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

async function obtenerPresupuesto() {
    const tx = db.transaction('presupuesto', 'readonly');
    const store = tx.objectStore('presupuesto');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function eliminarPresupuesto(id) {
    const tx = db.transaction('presupuesto', 'readwrite');
    const store = tx.objectStore('presupuesto');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// ============================================
// SUBCATEGORÍAS
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
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Renta', monto: 1025 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Super', monto: 200 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Aseguranza carro', monto: 95 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Celular', monto: 104 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Gasolina', monto: 100 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Laptop', monto: 50 },
        { categoria: 'GASTOS_ESENCIALES', nombre: 'Internet', monto: 70 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'Gastos variables', monto: 100 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Free', monto: 0 },
        { categoria: 'GASTOS_DISCRECIONALES', nombre: 'TC Nu', monto: 0 },
        { categoria: 'PAGO_DEUDAS', nombre: 'Solares', monto: 550 },
        { categoria: 'AHORROS', nombre: 'Ahorro USA', monto: 400 },
        { categoria: 'AHORROS', nombre: 'Ahorro MX', monto: 400 },
        { categoria: 'INVERSIONES', nombre: 'Inversión', monto: 0 }
    ];
    
    for (const item of defaults) {
        await guardarSubcategoria(item.categoria, item.nombre, item.monto);
    }
}

// ============================================
// TARJETAS DE CRÉDITO
// ============================================
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

async function obtenerTarjetas() {
    const tx = db.transaction('tarjetas', 'readonly');
    const store = tx.objectStore('tarjetas');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function eliminarTarjeta(id) {
    const tx = db.transaction('tarjetas', 'readwrite');
    const store = tx.objectStore('tarjetas');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function calcularDeudaTarjeta(tarjetaId, mes, anio) {
    const tx = db.transaction('transacciones', 'readonly');
    const store = tx.objectStore('transacciones');
    const index = store.index('tarjetaId');
    
    return new Promise((resolve, reject) => {
        const req = index.getAll(tarjetaId);
        req.onsuccess = () => {
            const transacciones = req.result.filter(t => t.mes === mes && t.anio === anio);
            const total = transacciones.reduce((sum, t) => sum + t.monto, 0);
            resolve(total);
        };
        req.onerror = () => reject(req.error);
    });
}

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
// GASTOS FIJOS
// ============================================
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

async function obtenerGastosFijos() {
    const tx = db.transaction('gastosFijos', 'readonly');
    const store = tx.objectStore('gastosFijos');
    return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function eliminarGastoFijo(id) {
    const tx = db.transaction('gastosFijos', 'readwrite');
    const store = tx.objectStore('gastosFijos');
    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function obtenerGastosFijosProximos(dias = 7) {
    const gastos = await obtenerGastosFijos();
    const hoy = new Date();
    const diaActual = hoy.getDate();
    
    return gastos.filter(g => {
        let diasHastaPago = g.diaPago - diaActual;
        if (diasHastaPago < 0) {
            diasHastaPago = g.diaPago + (new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - diaActual);
        }
        return diasHastaPago <= dias && diasHastaPago >= 0;
    });
}

// ============================================
// TRANSACCIONES
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
// PATRIMONIO
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
// CÁLCULOS
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

function formatearMoneda(valor, moneda = '$') {
    return moneda + ' ' + valor.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function obtenerNombreMes(mes) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes - 1];
}

// ============================================
// NOTIFICACIONES
// ============================================
function enviarNotificacion(titulo, mensaje) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(titulo, {
            body: mensaje,
            icon: 'assets/icons/icon-192.png',
            tag: 'recordatorio'
        });
    }
}

async function verificarRecordatorios() {
    const hoy = new Date();
    const diaActual = hoy.getDate();
    const mesActual = hoy.getMonth() + 1;
    const anioActual = hoy.getFullYear();
    
    const tarjetas = await obtenerTarjetas();
    for (const tarjeta of tarjetas) {
        const diasHastaPago = tarjeta.diaPago - diaActual;
        const deuda = await calcularDeudaTarjeta(tarjeta.id, mesActual, anioActual);
        
        if (diasHastaPago === 3 && deuda > 0) {
            enviarNotificacion(
                `💳 ${tarjeta.nombre} vence en 3 días`,
                `Debes $${deuda.toFixed(2)}. Pago el día ${tarjeta.diaPago}`
            );
        }
        if (diasHastaPago === 1 && deuda > 0) {
            enviarNotificacion(
                `⚠️ ¡Mañana vence ${tarjeta.nombre}!`,
                `Tienes que pagar $${deuda.toFixed(2)}`
            );
        }
        if (diasHastaPago === 0 && deuda > 0) {
            enviarNotificacion(
                `📢 ¡Hoy vence ${tarjeta.nombre}!`,
                `Paga $${deuda.toFixed(2)} antes de que termine el día`
            );
        }
        if (diasHastaPago > 0 && diasHastaPago <= 7 && deuda > 0) {
            const semanasRestantes = Math.ceil(diasHastaPago / 7);
            const pagoSemanal = deuda / semanasRestantes;
            enviarNotificacion(
                `📊 ${tarjeta.nombre} - Pago semanal`,
                `Te toca pagar $${pagoSemanal.toFixed(2)} esta semana (${semanasRestantes} semanas restantes)`
            );
        }
    }
    
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
    guardarSubcategoria,
    obtenerSubcategorias,
    eliminarSubcategoria,
    inicializarSubcategorias,
    guardarTarjeta,
    obtenerTarjetas,
    eliminarTarjeta,
    calcularDeudaTarjeta,
    obtenerGastosTarjetaPorMes,
    guardarGastoFijo,
    obtenerGastosFijos,
    eliminarGastoFijo,
    obtenerGastosFijosProximos,
    guardarTransaccion,
    obtenerTransacciones,
    eliminarTransaccion,
    guardarPatrimonio,
    obtenerPatrimonio,
    eliminarPatrimonio,
    verificarRecordatorios,
    enviarNotificacion,
    calcularTotalesPorCategoria,
    calcularRemanente,
    formatearMoneda,
    obtenerNombreMes,
    CATEGORIAS
};

// ============================================
// INICIALIZAR
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await abrirDB();
    
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    setTimeout(async () => {
        try {
            await verificarRecordatorios();
        } catch (e) {
            console.log('Error al verificar recordatorios:', e);
        }
    }, 3000);
});

setInterval(async () => {
    try {
        await verificarRecordatorios();
    } catch (e) {
        console.log('Error al verificar recordatorios:', e);
    }
}, 21600000);