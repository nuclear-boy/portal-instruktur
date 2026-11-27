type BrandMarkProps = {
  className?: string;
  alt?: string;
};

export function BrandMark({ className, alt = 'Logo Pelajar Islam Indonesia' }: BrandMarkProps) {
  return (
    <img
      className={['brand-logo', className].filter(Boolean).join(' ')}
      src={`${import.meta.env.BASE_URL}logo-pii.png`}
      alt={alt}
    />
  );
}
