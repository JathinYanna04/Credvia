import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Browser } from '@playwright/test';
import yazl from 'yazl';

export async function createResumePdfFixture(browser: Browser, outputDir: string) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, 'career-match-e2e.pdf');
  const page = await browser.newPage();

  await page.setContent(`
    <html>
      <body style="font-family: Arial, sans-serif; padding: 32px; line-height: 1.5;">
        <h1>Credvia Career Match Tester</h1>
        <p>Full-stack software engineer building reliable product workflows for startups.</p>
        <h2>Summary</h2>
        <p>Engineer with experience across React, TypeScript, Node.js, PostgreSQL, and product delivery.</p>
        <h2>Skills</h2>
        <p>React, TypeScript, JavaScript, Node.js, PostgreSQL, Product Engineering</p>
        <h2>Experience</h2>
        <p>Software Engineer, 4 years building web platforms and growth tools.</p>
        <h2>Projects</h2>
        <p>Built a startup hiring workflow and a community platform for founders.</p>
        <h2>Education</h2>
        <p>B.Tech in Computer Science</p>
      </body>
    </html>
  `);

  await page.pdf({
    path: filePath,
    format: 'A4',
    printBackground: false,
  });
  await page.close();

  return filePath;
}

export async function createResumeDocxFixture(outputDir: string) {
  const filePath = path.join(outputDir, 'career-match-e2e.docx');
  const zipFile = new yazl.ZipFile();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Credvia Career Match Tester</w:t></w:r></w:p>
    <w:p><w:r><w:t>Summary</w:t></w:r></w:p>
    <w:p><w:r><w:t>Full-stack software engineer building reliable product workflows for startups.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Skills</w:t></w:r></w:p>
    <w:p><w:r><w:t>React, TypeScript, JavaScript, Node.js, PostgreSQL, Product Engineering</w:t></w:r></w:p>
    <w:p><w:r><w:t>Experience</w:t></w:r></w:p>
    <w:p><w:r><w:t>Software Engineer, 4 years building web platforms and growth tools.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Projects</w:t></w:r></w:p>
    <w:p><w:r><w:t>Built a startup hiring workflow and a community platform for founders.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Education</w:t></w:r></w:p>
    <w:p><w:r><w:t>B.Tech in Computer Science</w:t></w:r></w:p>
    <w:sectPr />
  </w:body>
</w:document>`;

  await fs.mkdir(outputDir, { recursive: true });
  await fs.rm(filePath, { force: true });

  zipFile.addBuffer(Buffer.from(contentTypes, 'utf8'), '[Content_Types].xml');
  zipFile.addBuffer(Buffer.from(relationships, 'utf8'), '_rels/.rels');
  zipFile.addBuffer(Buffer.from(documentXml, 'utf8'), 'word/document.xml');

  await new Promise<void>((resolve, reject) => {
    zipFile.outputStream
      .pipe(createWriteStream(filePath))
      .on('close', () => resolve())
      .on('error', reject);

    zipFile.end();
  });

  return filePath;
}
