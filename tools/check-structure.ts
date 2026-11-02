import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const errors = [];
let classes = 0;

function visitDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      visitDirectory(file);
      continue;
    }

    if (!/\.tsx?$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    function inspect(node: ts.Node) {
      if (ts.isClassDeclaration(node)) {
        classes++;
        if (
          !ts.getJSDocCommentsAndTags(node).some((doc) => /[А-Яа-яЁё]/.test(doc.getText(source)))
        ) {
          errors.push(`${file}: у класса ${node.name?.text} нет русского комментария`);
        }
        node.members.forEach((member, index) => {
          const next = node.members[index + 1];
          if ('body' in member && member.body && next) {
            const gap = text.slice(member.end, next.getStart(source));
            if (!/\r?\n\s*\r?\n/.test(gap)) {
              errors.push(
                `${file}: после метода ${member.name?.getText(source) ?? 'constructor'} нужна пустая строка`,
              );
            }
          }
        });
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
}

visitDirectory('src');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Проверены русские комментарии и разделение методов: ${classes} классов.`);
}
