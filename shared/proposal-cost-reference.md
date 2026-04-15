# Cost Reference — Costos Operativos de Proyectos IM3

Este archivo se inyecta en el `system` prompt de Claude al generar propuestas. Define los costos reales que el cliente pagará mensualmente DESPUÉS de que IM3 entregue el proyecto.

**Objetivo**: transparencia total. Ninguna propuesta IM3 esconde gastos recurrentes. Eso construye confianza y abre la puerta al upsell de managed services.

---

## Stack base IM3 (precios en USD, ~abril 2026)

### Infraestructura

| Servicio | Tier mínimo | Tier escalado | Notas |
|---|---|---|---|
| **Railway** (hosting + PostgreSQL) | $5-10/mes (hobby) | $20-50/mes (pro, 1-5GB) | Escala a $100+ con muchos usuarios |
| **Dominio** (.com, .co) | $1-1.3/mes ($12-15/año) | Igual | Renovación anual |
| **Supabase Storage** (si aplica — audio, archivos) | Free hasta 1GB | $0.021/GB/mes | Proyectos con archivos multimedia |
| **Cloud Backups** (DB backups) | Incluido Railway | $5-15/mes si externo | Considerar solo si data crítica |

### Comunicación

| Servicio | Tier mínimo | Tier escalado | Notas |
|---|---|---|---|
| **Resend** (emails transaccionales + marketing) | Free hasta 100/día, 3000/mes | $20/mes hasta 50k · $80/mes hasta 100k | La mayoría de proyectos IM3 caen en $0-20 |
| **Meta WhatsApp Cloud API** | Gratis las primeras 1000 conversaciones/mes | $0.005-0.03 por conversación (varía por país) | Colombia: $0.018/conv aprox |
| **Twilio** (SMS, si aplica) | Pay-per-SMS ~$0.04 Colombia | Mismo | Raro; solo si se requiere SMS masivo |

### IA y automatización

| Servicio | Tier mínimo | Tier escalado | Notas |
|---|---|---|---|
| **Anthropic Claude** (Sonnet 4) | $3/1M input, $15/1M output | Lineal con uso | Proyecto típico: $20-80/mes. Uso alto: $150-400/mes |
| **Anthropic Claude** (Haiku 4.5, más barato) | $0.25/1M input, $1.25/1M output | Lineal | Para clasificación/routing |
| **OpenAI Whisper** (si hay transcripción audio) | $0.006/min | $0.006/min | $30/mes para ~80 horas de audio |
| **Google Workspace APIs** (Gmail/Drive/Calendar) | Gratis dentro del Workspace del cliente | Sin límite relevante | Requiere que cliente tenga Workspace ($6-18/user/mes Google) |

### Pagos (si el proyecto los usa)

| Servicio | Modelo | Notas |
|---|---|---|
| **Stripe** | 2.9% + $0.30 por transacción | Sin mensualidad |
| **ePayco / PayU** (Colombia) | 3.5-5% por transacción | Alternativa local |
| **MercadoPago** | 3-4% por transacción | Popular en LATAM |

### Google Workspace (si cliente quiere integrar su correo/drive)

| Tier | Precio | Para quién |
|---|---|---|
| Business Starter | $6/user/mes | 1-5 empleados, básico |
| Business Standard | $12/user/mes | 5-50 empleados, almacenamiento grande |
| Business Plus | $18/user/mes | 50+, compliance |

### Monitoring (opcional, recomendado)

| Servicio | Tier mínimo | Notas |
|---|---|---|
| **Sentry** (error tracking) | Free 5k errors/mes | $26/mes tier team |
| **Uptime monitoring** (UptimeRobot, Better Stack) | Free básico | $10-30/mes profesional |

---

## Reglas de estimación por escala del cliente

Determinar el tier en base al diagnóstico del cliente:

### Tier S — Cliente pequeño
**Criterios**: 1-10 empleados, <500 operaciones/mes, presupuesto diagnóstico <$5k USD
**Estimación mensual total**: **$45-95 USD/mes**
- Railway hobby: $5
- Postgres: $5
- Dominio: $1
- Resend: $0 (free tier)
- Claude API: $30-80 (uso moderado)
- WhatsApp: $0-5

### Tier M — Cliente mediano
**Criterios**: 10-50 empleados, 500-10,000 operaciones/mes, presupuesto $5-20k
**Estimación mensual total**: **$120-280 USD/mes**
- Railway pro: $20-40
- Postgres con 1-5GB: $10-25
- Resend: $20 (tier bajo)
- Claude API: $80-180
- WhatsApp: $10-30
- Monitoring: $0-20

### Tier L — Cliente grande
**Criterios**: 50+ empleados, 10k+ operaciones/mes, presupuesto $20k+
**Estimación mensual total**: **$280-600 USD/mes**
- Railway pro escalado: $50-120
- Postgres 5-15GB: $25-80
- Resend pro: $80
- Claude API con IA heavy: $200-400
- WhatsApp con volumen: $50-150
- Monitoring: $30-60
- Backups externos: $15-30

### Ajustes por features específicas

- **Proyecto con grabación de audio** (tipo Acta): +$30-80/mes por Whisper + storage
- **E-commerce con pagos**: +2.9-5% por transacción (no es "costo fijo" pero mencionarlo)
- **App móvil nativa** (no PWA): +$99/año Apple Developer + $25 Google Play (único pago)
- **Integración con Google Workspace del cliente**: El cliente paga aparte $6-18/user/mes de Google
- **Uso intensivo de IA generativa** (chat 24/7 con clientes): considerar tier L siempre, API $300+

---

## Template de la sección `operationalCosts` (formato del schema)

```json
{
  "heading": "Costos operativos mensuales",
  "intro": "Transparencia total. Estos son los gastos recurrentes que pagarás a cada proveedor después del lanzamiento. IM3 no agrega margen aquí — los costos son los reales del mercado.",
  "categories": [
    {
      "name": "Infraestructura",
      "items": [
        { "service": "Railway (hosting + base de datos)", "cost": "$25-40 USD/mes", "note": "Escala con usuarios activos" },
        { "service": "Dominio .com", "cost": "$1 USD/mes", "note": "$15 USD/año" }
      ]
    },
    {
      "name": "Comunicación",
      "items": [
        { "service": "Resend (envío de emails)", "cost": "$0-20 USD/mes", "note": "Gratis hasta 3.000 emails/mes" },
        { "service": "WhatsApp Business API (Meta)", "cost": "$10-30 USD/mes", "note": "Primeras 1.000 conversaciones/mes gratis" }
      ]
    },
    {
      "name": "IA y automatización",
      "items": [
        { "service": "Anthropic Claude (IA generativa)", "cost": "$30-100 USD/mes", "note": "Uso estimado según volumen proyectado" }
      ]
    }
  ],
  "monthlyRangeLow": "$65 USD/mes",
  "monthlyRangeHigh": "$190 USD/mes",
  "annualEstimate": "$1.500 USD/año aprox",
  "paidBy": "cliente-directo",
  "managedServicesUpsell": "¿Prefieres no preocuparte por esto? Por $150 USD/mes adicionales administramos todo (hosting, APIs, actualizaciones, soporte 24/7). Incluye monitoreo proactivo y respuesta a incidentes en <2h.",
  "disclaimer": "Estos costos los pagas directamente a cada proveedor. IM3 no agrega margen aquí — la transparencia es parte del trato."
}
```

---

## Principios para Claude al generar esta sección

### REGLA DE ORO: CONSERVADOR > OPTIMISTA

El cliente debe sentir que pagó **menos** de lo esperado, **nunca más**. Por eso:

1. **Buffer de +20% en el techo**. Después de sumar los máximos de cada item, multiplica por 1.2 y redondea hacia arriba al múltiplo de $5 más cercano. Ejemplo: suma real $158/mes → reportar como $190/mes.
2. **Redondeo al alza en rangos**. Si un servicio cuesta $37-48/mes real, reportar como "$40-50 USD/mes". Nunca redondear hacia abajo.
3. **Si hay duda entre dos tiers** (ej: el cliente cae en borde entre tier S y M), usar el tier **superior**. Preferimos sobreestimar costos a subestimar.

### REGLAS DE SELECCIÓN DE SERVICIOS

4. **Solo incluir servicios que la solución realmente va a usar**. Revisa `solution.modules` — si no hay módulo de WhatsApp, no incluyas WhatsApp. Si la solución no usa IA generativa, no incluyas Claude API (pero casi todas la usan).
5. **Usar el tier correcto** según el diagnóstico del cliente (empleados + presupuesto + volumen)
6. **Máximo 2-3 items por categoría, máximo 4 categorías**. Más items = percepción de que el sistema es caro de operar.

### REGLAS DE FORMATO

7. **Ser específico con cifras** ("$25-40 USD/mes") — rangos que reflejen realidad + buffer, no "varía según uso"
8. **Explicar brevemente cada item** en el `note` — por qué tiene ese costo, cuándo escala. Lenguaje de negocio, no técnico.
9. **Calcular `monthlyRangeLow`** sumando los mínimos de TODOS los items
10. **Calcular `monthlyRangeHigh`** como `(suma de máximos) × 1.2` redondeado al alza
11. **Calcular `annualEstimate`** como `((monthlyRangeLow + monthlyRangeHigh) / 2) × 12`, redondeado a los $100 más cercanos
12. **Default `paidBy`**: `"cliente-directo"` — más honesto, el cliente ve que no hay margen oculto
13. **SIEMPRE incluir `managedServicesUpsell`** — abre puerta al revenue recurrente. Formato: "Por $X USD/mes adicionales administramos todo (hosting, APIs, actualizaciones, soporte). X típicamente = monthlyRangeHigh × 2 redondeado a centena."
14. **`disclaimer`**: corta frase de transparencia. "Estos costos los pagas directamente a cada proveedor. IM3 no agrega margen aquí."

## Lo que NO hagas

- ❌ Inventar costos irreales ("$500/mes" para proyecto pequeño)
- ❌ Ocultar costos ("todo incluido" si no lo está)
- ❌ Marcar márgenes aquí (pasa-costos literal)
- ❌ Usar tecnicismos en el `note` ("throughput de 100 rps") — usar lenguaje de negocio
- ❌ Sobrecargar con 15 items — máximo 2-3 items por categoría, 3 categorías
- ❌ **Subestimar**. Si dudas entre dos cifras, siempre la más alta
- ❌ Incluir servicios que NO se usan en el proyecto (ej: WhatsApp si no hay módulo WA)
- ❌ Omitir el buffer del +20% en el techo
