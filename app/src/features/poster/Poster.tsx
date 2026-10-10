import { forwardRef } from 'react';
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

const FONT = 'System';

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
  const r = Math.min(cellW * 0.32, cellH * 0.28, 120);

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
            <SvgText
              x={cx}
              y={cy + r + 62}
              fill={th.ink}
              fontSize={Math.min(44, cellW / 9)}
              fontWeight="700"
              fontFamily={FONT}
              textAnchor="middle"
            >
              {t.name.slice(0, 20)}
            </SvgText>
            {t.detail ? (
              <SvgText
                x={cx}
                y={cy + r + 112}
                fill={th.accent}
                fontSize={Math.min(40, cellW / 10)}
                fontWeight="700"
                fontFamily={FONT}
                textAnchor="middle"
              >
                {t.detail.slice(0, 22)}
              </SvgText>
            ) : null}
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
