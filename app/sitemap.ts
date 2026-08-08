import type { MetadataRoute } from "next"
import { getAllPosts } from "@/lib/blog"
import { prisma } from "@/lib/prisma"
import { getAppUrl } from "@/lib/urls"
import { getCityIndex, MIN_CITY_LISTINGS } from "@/lib/properties"

const BASE_URL = getAppUrl()

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE_URL, priority: 1, changeFrequency: "weekly" },
    { url: `${BASE_URL}/precios`, priority: 0.8, changeFrequency: "monthly" },
    { url: `${BASE_URL}/blog`, priority: 0.8, changeFrequency: "weekly" },
    { url: `${BASE_URL}/contacto`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${BASE_URL}/propiedades`, priority: 0.7, changeFrequency: "weekly" },
  ]

  const blogPosts = getAllPosts().map((post) => ({
    url: `${BASE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.dateModified ?? post.date),
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }))

  const properties = await prisma.property.findMany({
    where: { published: true },
    select: { slug: true, updatedAt: true },
  })

  const propertyRoutes: MetadataRoute.Sitemap = properties.map((p) => ({
    url: `${BASE_URL}/p/${p.slug}`,
    lastModified: p.updatedAt,
    priority: 0.6,
    changeFrequency: "weekly" as const,
  }))

  const agents = await prisma.user.findMany({
    where: { profilePublished: true, agentSlug: { not: null } },
    select: { agentSlug: true, updatedAt: true },
  })

  const agentRoutes: MetadataRoute.Sitemap = agents.map((a) => ({
    url: `${BASE_URL}/agente/${a.agentSlug}`,
    lastModified: a.updatedAt,
    priority: 0.6,
    changeFrequency: "weekly" as const,
  }))

  const cityIndex = await getCityIndex()
  const cityRoutes: MetadataRoute.Sitemap = cityIndex
    .filter((g) => g.count >= MIN_CITY_LISTINGS)
    .map((g) => ({
      url: `${BASE_URL}/propiedades/${g.slug}`,
      priority: 0.6,
      changeFrequency: "weekly" as const,
    }))

  return [...staticRoutes, ...blogPosts, ...propertyRoutes, ...agentRoutes, ...cityRoutes]
}
