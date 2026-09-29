import JsBarcode from 'jsbarcode';
import { useLayoutEffect, useRef } from 'react';

interface BarcodeProps {
  value: string;
  className?: string;
}

/** A real, scannable Code 128 barcode of the tracking number. Decorative for screen readers. */
export function Barcode({ value, className }: BarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        height: 64,
        width: 2,
        background: 'transparent',
        lineColor: 'currentColor',
      });
      // Swap JsBarcode's fixed pixel size for a viewBox so it scales to the label.
      const width = svg.getAttribute('width');
      const height = svg.getAttribute('height');
      if (width && height) {
        svg.setAttribute('viewBox', `0 0 ${parseFloat(width)} ${parseFloat(height)}`);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('preserveAspectRatio', 'none');
      }
    } catch {
      svg.replaceChildren();
    }
  }, [value]);

  return <svg ref={svgRef} aria-hidden="true" className={className} />;
}
