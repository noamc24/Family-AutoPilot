import { BriefcaseBusiness, BusFront, CalendarDays, CloudSun, GraduationCap, House, Mail, MapPin, MessageCircle, School, Shapes, TrafficCone } from 'lucide-react'
import type { IntegrationSource } from '../data'

const icons: Record<IntegrationSource, typeof House> = {
  family: House, weather: CloudSun, calendar: CalendarDays, whatsapp: MessageCircle,
  email: Mail, waze: TrafficCone, location: MapPin, school: School,
  university: GraduationCap, work: BriefcaseBusiness, club: Shapes, transit: BusFront,
}

export function SourceIcon({ sourceId, size = 19 }: { sourceId: IntegrationSource; size?: number }) {
  const Icon = icons[sourceId] || Shapes
  return <Icon size={size} strokeWidth={1.8}/>
}
