import { forwardRef } from 'react';
import { Platform } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Image as SvgImage,
  LinearGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  fitText,
  gridFor,
  initials,
  SIZES,
  THEMES,
  wrapText,
  type PosterKind,
  type PosterSize,
} from './layout';

export interface Topper {
  name: string;
  detail: string; // e.g. "98% • Class 10"
  photo?: string; // data: URI so it survives export
}

export interface PosterData {
  kind: PosterKind;
  size: PosterSize;
  headline: string;
  subline: string;
  toppers: Topper[];
  centre: string;
  address: string;
  phone: string;
  logo?: string; // data: URI
}

// "System" is not a font a browser knows (it fell back to serif there): name real sans-serif faces on the web
const FONT = Platform.OS === 'web' ? 'Inter, Arial, Helvetica, sans-serif' : 'System';
/** Line spacing for a name or detail that wraps to a second line, as a share of its size. */
const LEAD = 1.15;

/** The poster itself, drawn at full resolution (1080 wide) and scaled to `width` on screen. */
export const Poster = forwardRef<Svg, { data: PosterData; width: number }>(function Poster(
  { data, width },
  ref,
) {
  const { w, h } = SIZES[data.size];
  const th = THEMES[data.kind];
  const tall = data.size === 'status';
  const pad = 72;

  const headLines = wrapText(data.headline || ' ', 18, 2);
  const subLines = wrapText(data.subline, 34, 2);
  const headSize = 92;
  let y = tall ? 330 : 230;
  const headY = y;
  y += headLines.length * (headSize + 8);
  const subY = y + 10;
  y += subLines.length * 52 + 40;

  const toppers =
    data.kind === 'toppers' ? data.toppers.filter((t) => t.name.trim()).slice(0, 6) : [];
  const grid = gridFor(toppers.length);
  const footerH = tall ? 260 : 200;
  const areaTop = y;
  const areaH = h - footerH - areaTop - 30;
  const cellW = grid.cols ? (w - pad * 2) / grid.cols : 0;
  const cellH = grid.rows ? areaH / grid.rows : 0;

  // Names and details fit the width of their card (2-3 to a row left them running into the next one): smaller for
  // long ones, two lines for very long ones, at one size for every card so the row looks even.
  const textW = Math.max(cellW - 24, 1);
  const nameMax = Math.min(44, cellW / 9);
  const detailMax = Math.min(40, cellW / 10);
  const fitted = toppers.map((t) => ({
    name: fitText(t.name.slice(0, 20), textW, nameMax, 28),
    detail: fitText(t.detail.slice(0, 22), textW, detailMax, 26),
  }));
  const nameSize = Math.min(nameMax, ...fitted.map((f) => f.name.size));
  const detailSize = Math.min(detailMax, ...fitted.map((f) => f.detail.size));
  const nameLines = Math.max(1, ...fitted.map((f) => f.name.lines.length));
  const detailLines = Math.max(0, ...fitted.map((f) => f.detail.lines.length));
  const textH =
    18 +
    nameSize * (1 + (nameLines - 1) * LEAD) +
    (detailLines ? detailSize * (1.25 + (detailLines - 1) * LEAD) : 0);
  // the photo gives up some size (never below 60%) when the text needs the room
  const fullR = Math.min(cellW * 0.32, cellH * 0.28, 120);
  const r = Math.max(fullR * 0.6, Math.min(fullR, (cellH - 10 - 8 - textH - 12) / 2));

  return (
    <Svg ref={ref} width={width} height={(width * h) / w} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={th.from} />
          <Stop offset="1" stopColor={th.to} />
        </LinearGradient>
        {toppers.map((_, i) => {
          const cx = pad + cellW * ((i % grid.cols) + 0.5);
          const cy = areaTop + cellH * Math.floor(i / grid.cols) + r + 10;
          return (
            <ClipPath key={i} id={`ph${i}`}>
              <Circle cx={cx} cy={cy} r={r} />
            </ClipPath>
          );
        })}
        <ClipPath id="logo">
          <Circle cx={pad + 56} cy={tall ? 150 : 110} r={56} />
        </ClipPath>
      </Defs>

      <Rect width={w} height={h} fill="url(#bg)" />
      <Circle cx={w - 60} cy={80} r={260} fill="#FFFFFF" opacity={0.06} />
      <Circle cx={40} cy={h - 120} r={200} fill="#FFFFFF" opacity={0.05} />

      {/* Centre name (and logo) at the top */}
      {data.logo ? (
        <SvgImage
          href={{ uri: data.logo }}
          x={pad}
          y={(tall ? 150 : 110) - 56}
          width={112}
          height={112}
          preserveAspectRatio="xMidYMid slice"
          clipPath="url(#logo)"
        />
      ) : null}
      <SvgText
        x={data.logo ? pad + 136 : pad}
        y={(tall ? 150 : 110) + 16}
        fill={th.accent}
        fontSize={44}
        fontWeight="700"
        fontFamily={FONT}
      >
        {data.centre.slice(0, 32)}
      </SvgText>

      {headLines.map((line, i) => (
        <SvgText
          key={i}
          x={w / 2}
          y={headY + i * (headSize + 8) + headSize}
          fill={th.ink}
          fontSize={headSize}
          fontWeight="800"
          fontFamily={FONT}
          textAnchor="middle"
        >
          {line}
        </SvgText>
      ))}
      {subLines.map((line, i) => (
        <SvgText
          key={i}
          x={w / 2}
          y={subY + i * 52 + 44}
          fill={th.ink}
          opacity={0.88}
          fontSize={42}
          fontFamily={FONT}
          textAnchor="middle"
        >
          {line}
        </SvgText>
      ))}

      {toppers.map((t, i) => {
        const cx = pad + cellW * ((i % grid.cols) + 0.5);
        const top = areaTop + cellH * Math.floor(i / grid.cols);
        const cy = top + r + 10;
        return (
          <G key={i}>
            <Circle cx={cx} cy={cy} r={r + 8} fill={th.accent} />
            {t.photo ? (
              <SvgImage
                href={{ uri: t.photo }}
                x={cx - r}
                y={cy - r}
                width={r * 2}
                height={r * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#ph${i})`}
              />
            ) : (
              <>
                <SvgText
                  x={cx}
                  y={cy + r * 0.25}
                  fill={th.from}
                  fontSize={r * 0.7}
                  fontWeight="700"
                  fontFamily={FONT}
                  textAnchor="middle"
                >
                  {initials(t.name)}
                </SvgText>
              </>
            )}
            {fitted[i]!.name.lines.map((line, j) => (
              <SvgText
                key={`n${j}`}
                x={cx}
                y={cy + r + 18 + nameSize * (1 + j * LEAD)}
                fill={th.ink}
                fontSize={nameSize}
                fontWeight="700"
                fontFamily={FONT}
                textAnchor="middle"
              >
                {line}
              </SvgText>
            ))}
            {fitted[i]!.detail.lines.map((line, j) => (
              <SvgText
                key={`d${j}`}
                x={cx}
                y={
                  cy +
                  r +
                  18 +
                  nameSize * (1 + (fitted[i]!.name.lines.length - 1) * LEAD) +
                  detailSize * (1.25 + j * LEAD)
                }
                fill={th.accent}
                fontSize={detailSize}
                fontWeight="700"
                fontFamily={FONT}
                textAnchor="middle"
              >
                {line}
              </SvgText>
            ))}
          </G>
        );
      })}

      {/* Footer: address and phone */}
      <Rect x={0} y={h - footerH} width={w} height={footerH} fill="#000000" opacity={0.22} />
      {data.address ? (
        <SvgText
          x={w / 2}
          y={h - footerH + (tall ? 100 : 80)}
          fill={th.ink}
          fontSize={36}
          fontFamily={FONT}
          textAnchor="middle"
        >
          {data.address.slice(0, 48)}
        </SvgText>
      ) : null}
      {data.phone ? (
        <SvgText
          x={w / 2}
          y={h - footerH + (tall ? 170 : 140)}
          fill={th.accent}
          fontSize={46}
          fontWeight="800"
          fontFamily={FONT}
          textAnchor="middle"
        >
          {`Call ${data.phone}`}
        </SvgText>
      ) : null}
    </Svg>
  );
});
