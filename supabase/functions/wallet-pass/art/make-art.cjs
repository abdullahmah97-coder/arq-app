const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const markSvg = fs.readFileSync('/home/claude/gym-social/assets/brand/mark.svg', 'utf8');
const lockSvg = fs.readFileSync('/home/claude/gym-social/assets/brand/lockup.svg', 'utf8');
const THEMES = {
  palm:     { stops: ['#FEA94F', '#F1551D', '#0A332D'], mark: '#F7DFBB', markOp: 0.30, logo: '#F8EDDA' },
  oasis:    { stops: ['#F7DFBB', '#FEA94F', '#2F4B3C'], mark: '#F8EDDA', markOp: 0.32, logo: '#F8EDDA' },
  dune:     { stops: ['#FEA94F', '#F1551D', '#5C230D'], mark: '#F8EDDA', markOp: 0.28, logo: '#F8EDDA' },
  sand:     { stops: ['#F8EDDA', '#F7DFBB', '#FEA94F'], mark: '#0A332D', markOp: 0.16, logo: '#0A332D' },
  lavender: { stops: ['#C9B6EE', '#7B5BC4', '#2E2248'], mark: '#F7F3FC', markOp: 0.30, logo: '#F7F3FC' },
};
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
fs.mkdirSync('art', { recursive: true });
for (const [id, t] of Object.entries(THEMES)) {
  for (const s of [2, 3]) {
    const W = 375 * s, H = 123 * s;
    // الشعار كبير على الطرف ومقصوص (مثل التاق)، والتدرج من فوق لتحت
    const mk = inner(markSvg).replace(/fill="#0A332D"/g, `fill="${t.mark}"`);
    const mw = W * 0.56, mh = mw * (90.191 / 124.039);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${t.stops[0]}"/><stop offset="0.5" stop-color="${t.stops[1]}"/><stop offset="1" stop-color="${t.stops[2]}"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <g opacity="${t.markOp}" transform="translate(${(W - mw) / 2}, ${-mh * 0.42}) scale(${mw / 124.039})">${mk}</g>
    </svg>`;
    const png = new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng();
    fs.writeFileSync(`art/strip-${id}@${s}x.png`, png);
  }
  for (const s of [1, 2, 3]) {
    const r = new Resvg(lockSvg.replace(/#0A332D/g, t.logo), { fitTo: { mode: 'width', value: 150 * s }, background: 'rgba(0,0,0,0)' });
    fs.writeFileSync(`art/logo-${id}${s === 1 ? '' : '@' + s + 'x'}.png`, r.render().asPng());
  }
}
