import { useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { Leaf, CloudUpload, type LucideIcon } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
gsap.registerPlugin(useGSAP);
export function MotionContent({
  children,
  identity,
}: {
  children: ReactNode;
  identity: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          scope.current,
          { y: 6, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.22,
            ease: 'power2.out',
            clearProps: 'transform,opacity',
          },
        );
      });
      return () => mm.revert();
    },
    { scope, dependencies: [identity], revertOnUpdate: true },
  );
  return (
    <div ref={scope} data-motion-content className="motion-content">
      {children}
    </div>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Leaf aria-hidden="true" />
      </span>
      <div>
        <strong>学伴</strong>
        <p>家庭作业管理</p>
      </div>
    </div>
  );
}
export function Choice({
  label,
  value,
  onChange,
  options,
  icon: Icon,
  disabled = false,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  icon?: LucideIcon;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={label} size="touch" className="w-full">
        {Icon && <Icon aria-hidden="true" />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
export function StatePanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <Empty className="min-h-64">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
export function SyncStatus() {
  return (
    <Alert className="sync-alert">
      <CloudUpload aria-hidden="true" />
      <AlertTitle>尚未同步到学习机</AlertTitle>
      <AlertDescription>草稿保存在本机，未向学习机发送作业。</AlertDescription>
    </Alert>
  );
}
