import {
  Shield,
  ShieldCheck,
  Building2,
  Cpu,
  AlertTriangle,
  Scale,
  UserCheck,
  Server,
  Siren,
  type LucideIcon,
} from "lucide-react";

export type Profession = {
  id: string;
  slug: string;
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
};

export const professions: readonly Profession[] = [
  { id: "police", slug: "police", titleKey: "profession.police.title", descKey: "profession.police.desc", icon: Shield },
  { id: "security_officer", slug: "security-officer", titleKey: "profession.security_officer.title", descKey: "profession.security_officer.desc", icon: ShieldCheck },
  { id: "security_manager", slug: "security-manager", titleKey: "profession.security_manager.title", descKey: "profession.security_manager.desc", icon: Building2 },
  { id: "security_technician", slug: "security-technician", titleKey: "profession.security_technician.title", descKey: "profession.security_technician.desc", icon: Cpu },
  { id: "risk_manager", slug: "risk-manager", titleKey: "profession.risk_manager.title", descKey: "profession.risk_manager.desc", icon: AlertTriangle },
  { id: "aml", slug: "aml-specialist", titleKey: "profession.aml.title", descKey: "profession.aml.desc", icon: Scale },
  { id: "close_protection", slug: "close-protection", titleKey: "profession.close_protection.title", descKey: "profession.close_protection.desc", icon: UserCheck },
  { id: "datacenter", slug: "data-center-security", titleKey: "profession.datacenter.title", descKey: "profession.datacenter.desc", icon: Server },
  { id: "emergency", slug: "emergency-crisis-management", titleKey: "profession.emergency.title", descKey: "profession.emergency.desc", icon: Siren },
] as const;