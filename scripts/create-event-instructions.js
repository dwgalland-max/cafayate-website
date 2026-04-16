const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, LevelFormat,
        ExternalHyperlink, BorderStyle, ShadingType, PageBreak } = require('docx');
const fs = require('fs');
const path = require('path');

const GREEN = '1E6A3A';
const DARK = '333333';
const GRAY = '666666';
const LIGHT_BG = 'F0F7F2';
const EXAMPLE_BG = 'FFF8E7';

const doc = new Document({
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: DARK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Georgia', color: GREEN },
        paragraph: { spacing: { before: 120, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Arial', color: GREEN },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ]
  },
  numbering: {
    config: [
      { reference: 'format-en',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'format-es',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'notes-en',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: 'notes-es',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ]
  },
  sections: [
    // ===== ENGLISH SECTION =====
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
        }
      },
      children: [
        // Title
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: 'Submit Your Event to Cafayate.com', font: 'Georgia', size: 36, bold: true, color: GREEN })]
        }),
        // Subtitle line
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 8 } },
          children: [new TextRun({ text: 'Free Community Events Calendar', size: 22, color: GRAY, italics: true })]
        }),
        // Intro
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun('Cafayate.com publishes a free community events calendar at '),
            new ExternalHyperlink({
              children: [new TextRun({ text: 'cafayate.com/en/pages/agenda', style: 'Hyperlink' })],
              link: 'https://cafayate.com/en/pages/agenda',
            }),
            new TextRun(' (English) and '),
            new ExternalHyperlink({
              children: [new TextRun({ text: 'cafayate.com/pages/agenda', style: 'Hyperlink' })],
              link: 'https://cafayate.com/pages/agenda',
            }),
            new TextRun(' (Spanish).'),
          ]
        }),
        // Email instruction
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun('To have your event listed, please email the following information to:')]
        }),
        // Email address - highlighted
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 240 },
          shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
          children: [new TextRun({ text: 'events@cafayate.com', size: 28, bold: true, color: GREEN })]
        }),

        // Format heading
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Format Your Submission')] }),
        // Numbered list
        ...[
          [{ text: 'EVENT NAME', bold: true }, { text: ' (in English and Spanish if possible)' }],
          [{ text: 'DATE', bold: true }, { text: ' (day, month, year)' }],
          [{ text: 'TIME', bold: true }, { text: ' (if applicable)' }],
          [{ text: 'LOCATION', bold: true }, { text: ' (venue name and address)' }],
          [{ text: 'DESCRIPTION', bold: true }, { text: ' \u2014 A short paragraph (approximately 30\u201350 words) describing your event' }],
          [{ text: 'LINK', bold: true }, { text: ' \u2014 A website or social media page for more information, or a contact email/phone number' }],
        ].map(parts => new Paragraph({
          numbering: { reference: 'format-en', level: 0 },
          spacing: { after: 80 },
          children: parts.map(p => new TextRun({ text: p.text, bold: p.bold || false }))
        })),

        // Example heading
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun('Example')] }),
        // Example box
        ...[
          ['Event: ', 'Sunset Wine Tasting at Bodega El Sol'],
          ['Evento: ', 'Degustaci\u00f3n de Vinos al Atardecer en Bodega El Sol'],
          ['Date: ', 'May 24, 2026'],
          ['Time: ', '18:00'],
          ['Location: ', 'Bodega El Sol, Ruta 40 Km 4338, Cafayate'],
          ['Description: ', 'Join us for an evening tasting of our new reserve wines paired with local cheeses and charcuterie, set against the backdrop of the Calchaqu\u00ed Valley at sunset.'],
          ['Descripci\u00f3n: ', 'Acomp\u00e1\u00f1enos a una degustaci\u00f3n nocturna de nuestros nuevos vinos reserva maridados con quesos y embutidos locales, con el atardecer del Valle Calchaqu\u00ed de fondo.'],
          ['More info: ', 'www.bodegaelsol.com / @bodegaelsol on Instagram'],
        ].map(([label, value]) => new Paragraph({
          spacing: { after: 60 },
          indent: { left: 360 },
          shading: { fill: EXAMPLE_BG, type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: label, bold: true, size: 20, color: DARK }),
            new TextRun({ text: value, size: 20, color: GRAY }),
          ]
        })),

        // Notes heading
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun('Notes')] }),
        ...[
          'Submissions are reviewed before publication. Please allow 24\u201348 hours for your event to appear.',
          'There is no charge for listing your event.',
          'If you only have the information in one language, that\u2019s fine \u2014 we can help with the translation.',
          'For recurring events, please send each date separately or specify the schedule (e.g., \u201Cevery Friday in May\u201D).',
        ].map(text => new Paragraph({
          numbering: { reference: 'notes-en', level: 0 },
          spacing: { after: 80 },
          children: [new TextRun({ text, size: 20, color: GRAY })]
        })),
        new Paragraph({
          numbering: { reference: 'notes-en', level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: 'Questions? Email ', size: 20, color: GRAY }),
            new ExternalHyperlink({
              children: [new TextRun({ text: 'info@cafayate.com', style: 'Hyperlink', size: 20 })],
              link: 'mailto:info@cafayate.com',
            }),
          ]
        }),

        // Page break before Spanish
        new Paragraph({ children: [new PageBreak()] }),

        // ===== SPANISH SECTION =====
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: 'Public\u00e1 Tu Evento en Cafayate.com', font: 'Georgia', size: 36, bold: true, color: GREEN })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 8 } },
          children: [new TextRun({ text: 'Calendario Gratuito de Eventos Comunitarios', size: 22, color: GRAY, italics: true })]
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun('Cafayate.com publica un calendario gratuito de eventos comunitarios en '),
            new ExternalHyperlink({
              children: [new TextRun({ text: 'cafayate.com/pages/agenda', style: 'Hyperlink' })],
              link: 'https://cafayate.com/pages/agenda',
            }),
            new TextRun(' (espa\u00f1ol) y '),
            new ExternalHyperlink({
              children: [new TextRun({ text: 'cafayate.com/en/pages/agenda', style: 'Hyperlink' })],
              link: 'https://cafayate.com/en/pages/agenda',
            }),
            new TextRun(' (ingl\u00e9s).'),
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun('Para que tu evento aparezca en el calendario, envi\u00e1 la siguiente informaci\u00f3n a:')]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 240 },
          shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
          children: [new TextRun({ text: 'events@cafayate.com', size: 28, bold: true, color: GREEN })]
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Formato de Env\u00edo')] }),
        ...[
          [{ text: 'NOMBRE DEL EVENTO', bold: true }, { text: ' (en espa\u00f1ol e ingl\u00e9s si es posible)' }],
          [{ text: 'FECHA', bold: true }, { text: ' (d\u00eda, mes, a\u00f1o)' }],
          [{ text: 'HORA', bold: true }, { text: ' (si corresponde)' }],
          [{ text: 'LUGAR', bold: true }, { text: ' (nombre del establecimiento y direcci\u00f3n)' }],
          [{ text: 'DESCRIPCI\u00d3N', bold: true }, { text: ' \u2014 Un p\u00e1rrafo breve (aproximadamente 30\u201350 palabras) describiendo el evento' }],
          [{ text: 'ENLACE', bold: true }, { text: ' \u2014 Un sitio web o p\u00e1gina de redes sociales para m\u00e1s informaci\u00f3n, o un email/tel\u00e9fono de contacto' }],
        ].map(parts => new Paragraph({
          numbering: { reference: 'format-es', level: 0 },
          spacing: { after: 80 },
          children: parts.map(p => new TextRun({ text: p.text, bold: p.bold || false }))
        })),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun('Ejemplo')] }),
        ...[
          ['Evento: ', 'Degustaci\u00f3n de Vinos al Atardecer en Bodega El Sol'],
          ['Event: ', 'Sunset Wine Tasting at Bodega El Sol'],
          ['Fecha: ', '24 de mayo de 2026'],
          ['Hora: ', '18:00'],
          ['Lugar: ', 'Bodega El Sol, Ruta 40 Km 4338, Cafayate'],
          ['Descripci\u00f3n: ', 'Acomp\u00e1\u00f1enos a una degustaci\u00f3n nocturna de nuestros nuevos vinos reserva maridados con quesos y embutidos locales, con el atardecer del Valle Calchaqu\u00ed de fondo.'],
          ['Description: ', 'Join us for an evening tasting of our new reserve wines paired with local cheeses and charcuterie, set against the backdrop of the Calchaqu\u00ed Valley at sunset.'],
          ['M\u00e1s info: ', 'www.bodegaelsol.com / @bodegaelsol en Instagram'],
        ].map(([label, value]) => new Paragraph({
          spacing: { after: 60 },
          indent: { left: 360 },
          shading: { fill: EXAMPLE_BG, type: ShadingType.CLEAR },
          children: [
            new TextRun({ text: label, bold: true, size: 20, color: DARK }),
            new TextRun({ text: value, size: 20, color: GRAY }),
          ]
        })),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun('Notas')] }),
        ...[
          'Los env\u00edos se revisan antes de su publicaci\u00f3n. El evento puede tardar entre 24 y 48 horas en aparecer.',
          'No hay costo por publicar tu evento.',
          'Si solo ten\u00e9s la informaci\u00f3n en un idioma, no hay problema \u2014 podemos ayudar con la traducci\u00f3n.',
          'Para eventos recurrentes, por favor envi\u00e1 cada fecha por separado o especific\u00e1 la frecuencia (ej: \u201Ctodos los viernes de mayo\u201D).',
        ].map(text => new Paragraph({
          numbering: { reference: 'notes-es', level: 0 },
          spacing: { after: 80 },
          children: [new TextRun({ text, size: 20, color: GRAY })]
        })),
        new Paragraph({
          numbering: { reference: 'notes-es', level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: '\u00bfPreguntas? Escribinos a ', size: 20, color: GRAY }),
            new ExternalHyperlink({
              children: [new TextRun({ text: 'info@cafayate.com', style: 'Hyperlink', size: 20 })],
              link: 'mailto:info@cafayate.com',
            }),
          ]
        }),
      ]
    }
  ]
});

const outputPath = path.join(process.env.USERPROFILE || process.env.HOME, 'Dropbox', 'CAFAYATE CONTENT 2026', 'Events', 'HOW TO SUBMIT AN EVENT.docx');

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outputPath, buffer);
  console.log('Created:', outputPath);
});
