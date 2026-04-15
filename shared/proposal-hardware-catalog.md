# Hardware Catalog — Equipos Físicos en Proyectos IM3

Este archivo se inyecta en el prompt de Claude al generar propuestas. Define el hardware físico que el cliente necesita COMPRAR (aparte del desarrollo) para que el sistema funcione.

**Objetivo**: transparencia total sobre hardware. Ninguna propuesta IM3 esconde equipos físicos necesarios. Evita sorpresas en implementación y permite al cliente planear su inversión completa.

---

## Cómo decide Claude qué hardware incluir

Claude revisa `solution.modules` de la propuesta y detecta si algún módulo **requiere hardware físico para funcionar**. Si sí, añade ese hardware a la sección `hardware` de la propuesta.

**Regla crítica**: si la solución NO requiere un hardware específico, NO lo incluyas. No llenes la sección con items irrelevantes.

**Si la solución NO requiere hardware físico alguno** (ej: un CRM de emails, una app SaaS pura, un blog): la sección `hardware` se omite completamente (devolver `hardware: null` o no incluir la key).

---

## Catálogo por categoría

### 🔐 BIOMETRÍA Y CONTROL DE ASISTENCIA

**Triggers** (si el módulo menciona estas palabras/conceptos):
- "control de asistencia", "attendance", "huellero", "fingerprint"
- "reconocimiento biométrico", "biometric", "ingreso con huella"
- "control horario", "time tracking físico"

**Items**:

- **Huellero digital USB (fingerprint reader)**
  - Marcas recomendadas: ZKTeco K40, Suprema BioMini Slim, Fingertec OFIS-Y
  - Specs: 500 DPI mínimo, SDK Windows/Linux/Android, indexación 1:N
  - Precio unitario: **$80-150 USD** (COP $320k - $600k)
  - Cantidad típica: 1 por sede / 1 por punto de entrada / 1 por oficina
  - Notas: Conexión USB directa al equipo del admin. Configuración lo hacemos nosotros.

- **Terminal biométrico standalone** (alternativa más robusta para puntos de entrada)
  - Marcas: ZKTeco MB460, Suprema BioStation A2, Hikvision DS-K1T671MF
  - Specs: Huella + facial + RFID, IP65, almacena 10k+ huellas, WiFi/Ethernet
  - Precio unitario: **$450-800 USD**
  - Cantidad: 1 por punto de entrada física (portería, oficina, bodega)
  - Notas: Se monta en pared, requiere power supply. Opcional si prefieren solo USB.

- **Lector de tarjetas RFID** (alternativa más barata que huellero para control básico)
  - Marcas: HID OMNIKEY, ACR122U
  - Precio unitario: **$40-80 USD**
  - Cantidad: 1 por punto de acceso
  - Notas: Requiere tarjetas adicionales ~$2-5 USD cada una.

### 📱 DISPOSITIVOS MÓVILES PARA OPERACIONES

**Triggers**:
- "app móvil", "campo", "geolocalización", "offline"
- "operaciones en terreno", "conductores", "repartidores"
- "toma de fotos", "evidencia fotográfica"

**Items**:

- **Tablet Android rugerizada** (para campo/bodega/conductores)
  - Marcas: Samsung Galaxy Tab Active, CAT T20, Zebra ET40
  - Specs: IP68, batería +10h, GPS, cámara, mín 4GB RAM
  - Precio unitario: **$350-600 USD**
  - Cantidad: 1 por operario en terreno

- **Celular Android gama media** (alternativa barata si no requiere ruggerización)
  - Modelos: Samsung A25/A35, Motorola G54
  - Specs: Android 13+, 6GB RAM, cámara decente, GPS
  - Precio unitario: **$180-280 USD**
  - Cantidad: 1 por operario
  - Notas: El cliente suele ya tener estos — mencionar que se puede usar el celular personal si cumple specs.

### 🧾 PUNTO DE VENTA (POS)

**Triggers**:
- "punto de venta", "POS", "facturación en el mostrador"
- "retail", "caja registradora", "tienda física"
- "impresión de recibos", "impresora térmica"

**Items**:

- **Impresora térmica de recibos**
  - Marcas: Epson TM-T20III, Star TSP143, Bixolon SRP-350
  - Specs: 80mm ancho, USB/Ethernet, auto-cut
  - Precio unitario: **$150-280 USD**
  - Cantidad: 1 por caja

- **Lector de código de barras (pistola)**
  - Marcas: Zebra DS2208, Honeywell Voyager 1250g, Symbol LS2208
  - Specs: 1D+2D, USB o Bluetooth
  - Precio unitario: **$80-180 USD**
  - Cantidad: 1 por caja

- **Cajón monedero**
  - Marcas: Digital POSCO, APG Vasario
  - Precio unitario: **$80-150 USD**
  - Cantidad: 1 por caja

- **Pantalla cliente / display LCD**
  - Opcional para mostrar el total al cliente en la caja
  - Precio unitario: **$60-150 USD**

### 🚚 LOGÍSTICA E INVENTARIO

**Triggers**:
- "inventario", "bodega", "warehouse"
- "picking", "escaneo masivo", "kardex"
- "trazabilidad", "lote", "serial"

**Items**:

- **Impresora de etiquetas térmicas**
  - Marcas: Zebra ZD220, Brother QL-820NWB, Honeywell PC42t
  - Specs: 203 DPI, rollo estándar, USB/Wi-Fi
  - Precio unitario: **$220-450 USD**
  - Cantidad: 1 por bodega

- **Lector de código de barras inalámbrico** (largo alcance)
  - Marcas: Zebra DS3678 (industrial rugged)
  - Precio unitario: **$350-650 USD**
  - Cantidad: 1 por picker

- **RFID reader** (si hay trazabilidad por RFID)
  - Marcas: Zebra FX9600, Impinj R420
  - Precio unitario: **$800-2000 USD**
  - Cantidad: según necesidad de dock/entrada

### 📹 SEGURIDAD Y VIDEOVIGILANCIA

**Triggers**:
- "cámaras", "CCTV", "seguridad"
- "monitoreo", "grabación"
- "reconocimiento facial en punto físico"

**Items**:

- **Cámara IP con AI (reconocimiento facial/objetos)**
  - Marcas: Hikvision DS-2CD2T47G2, Dahua IPC-HFW3449T1
  - Specs: 4MP, visión nocturna, PoE, AI edge
  - Precio unitario: **$180-350 USD**
  - Cantidad: según áreas a cubrir

- **NVR (Network Video Recorder)**
  - Marcas: Hikvision DS-7608NI, Dahua NVR4216
  - Specs: 8-16 canales, 2TB HDD incluido
  - Precio unitario: **$400-800 USD**
  - Cantidad: 1 por sede

### 🍽️ RESTAURANTES

**Triggers**:
- "restaurante", "cocina", "comandas"
- "KDS", "Kitchen Display System"
- "meseros", "tablet para tomar pedidos"

**Items**:

- **Kitchen Display System (KDS)**
  - Pantalla industrial touchscreen 15-21" con soporte de cocina
  - Precio unitario: **$500-900 USD**
  - Cantidad: 1 por estación de cocina

- **Impresora de comandas (cocina)**
  - Específicamente resistente a calor y grasa (Epson TM-U220)
  - Precio unitario: **$180-280 USD**
  - Cantidad: 1 por cocina/barra

### 🏭 PRODUCCIÓN / IOT

**Triggers**:
- "producción", "línea de manufactura", "sensores"
- "IoT", "PLC", "SCADA"
- "monitoreo de máquinas"

**Items**:

- **Gateway IoT industrial**
  - Marcas: Teltonika RUT240, Advantech WISE-710
  - Precio unitario: **$300-600 USD**

- **Sensores (temperatura, humedad, vibración)**
  - Precio unitario: **$20-80 USD cada uno**
  - Cantidad: según puntos de medición

---

## Formato de la sección `hardware` en el JSON

```json
{
  "heading": "Equipos físicos requeridos",
  "intro": "Para que el sistema funcione correctamente, estos son los equipos físicos que necesitas adquirir. IM3 no vende hardware — te asesoramos en la compra y dejamos todo configurado.",
  "items": [
    {
      "name": "Huellero digital USB",
      "description": "Lector biométrico para el control de asistencia. Se conecta al equipo del admin por USB.",
      "quantity": 2,
      "unitPriceUSD": "$120 USD",
      "totalPriceUSD": "$240 USD",
      "notes": "Marcas recomendadas: ZKTeco K40 o Suprema BioMini Slim. 1 por sede.",
      "paidBy": "cliente-compra"
    }
  ],
  "subtotalUSD": "$240 USD",
  "recommendationNote": "Te pasamos link de compra en Colombia. La configuración la hacemos nosotros sin costo adicional.",
  "disclaimer": "Precios aproximados — sujetos a disponibilidad en Colombia. IM3 no agrega margen aquí, tú compras directamente al proveedor."
}
```

### Campos

- **`items[].paidBy`** debe ser uno de:
  - `"cliente-compra"` — cliente compra directo al proveedor (por defecto, lo más honesto)
  - `"im3-incluye"` — IM3 incluye el hardware en el precio del desarrollo (raro)
  - `"im3-asesora"` — cliente compra pero IM3 le da link y asesora

- **`subtotalUSD`** debe ser la suma de todos los `totalPriceUSD`
- **`recommendationNote`**: un párrafo corto sobre cómo IM3 apoya la compra
- **`disclaimer`**: obligatorio. Mencionar que IM3 no marca margen (transparencia)

---

## Reglas para Claude al generar esta sección

1. **SÍ incluir hardware** si algún módulo de la solución requiere equipo físico (ver triggers arriba)
2. **NO incluir hardware** si la solución es puramente SaaS / web / app / integración
3. **Cantidades realistas** según el diagnóstico del cliente (# sedes, # empleados, # puntos de venta)
4. **Usar el tier medio del precio** del rango (ej: "$120 USD" si rango es $80-150)
5. **Siempre en USD** (la mayoría de hardware tech se importa/cotiza en USD)
6. **Si aplica más de 1 opción** (ej: huellero USB o terminal standalone), elegir la que encaja mejor según tamaño del proyecto. Mencionar alternativa en `notes`.
7. **Máximo 5-6 items** en total. No abrumar al cliente con detalles menores.

## Lo que NO hagas

- ❌ Inventar marcas/modelos que no existen
- ❌ Precios ridículamente altos o bajos
- ❌ Incluir hardware "por si acaso" cuando la solución no lo necesita
- ❌ Marcar margen sobre el hardware (IM3 no lo vende, pasa-costos literal)
- ❌ Ser vago: decir "equipos necesarios" sin especificar cuáles
- ❌ Ignorar el contexto del cliente (# empleados, # sedes)
