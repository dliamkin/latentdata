import { readFile } from 'node:fs/promises';

const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
const total = summary.total;
const row = (label, metric) => `| ${label} | ${metric.pct}% | ${metric.covered}/${metric.total} |`;

console.log('### Unit test coverage');
console.log('');
console.log('| Metric | Covered | Count |');
console.log('| --- | ---: | ---: |');
console.log(row('Statements', total.statements));
console.log(row('Branches', total.branches));
console.log(row('Functions', total.functions));
console.log(row('Lines', total.lines));
