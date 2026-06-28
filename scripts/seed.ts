import { drizzle } from "drizzle-orm/libsql";
import { helpRequests, professionals, user } from "../src/db/schema";

const db = drizzle({
  connection: { url: process.env.DATABASE_URL ?? "file:./local.db" },
});

const now = new Date().toISOString();

async function main() {
  await db
    .insert(user)
    .values([
      {
        id: "seed_user_ana",
        name: "Ana Perez",
        email: "ana.pro@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "seed_user_luis",
        name: "Luis Gomez",
        email: "luis.pro@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "seed_user_maria",
        name: "Maria Rodriguez",
        email: "maria.pro@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "seed_user_pending_1",
        name: "Profesional Pendiente Uno",
        email: "pendiente1@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "seed_user_pending_2",
        name: "Profesional Pendiente Dos",
        email: "pendiente2@example.com",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(professionals)
    .values([
      {
        id: "pro_seed_ana",
        userId: "seed_user_ana",
        email: "ana.pro@example.com",
        fullName: "Ana Perez",
        displayName: "Ana",
        country: "Venezuela",
        city: "Remoto",
        licenseNumber: "CRED-ANA",
        licenseCountry: "Venezuela",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo", "estres_agudo"]),
        remoteAvailable: true,
        crisisExperience: true,
        contactEmail: "ana.pro@example.com",
        status: "approved",
        acceptingRequests: true,
        maxActiveRequests: 3,
        currentActiveRequests: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pro_seed_luis",
        userId: "seed_user_luis",
        email: "luis.pro@example.com",
        fullName: "Luis Gomez",
        displayName: "Luis",
        country: "Colombia",
        city: "Remoto",
        licenseNumber: "CRED-LUIS",
        licenseCountry: "Colombia",
        languages: JSON.stringify(["es", "en"]),
        supportAreas: JSON.stringify([
          "ansiedad_panico",
          "orientacion_general",
        ]),
        remoteAvailable: true,
        crisisExperience: false,
        contactEmail: "luis.pro@example.com",
        status: "approved",
        acceptingRequests: true,
        maxActiveRequests: 2,
        currentActiveRequests: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pro_seed_maria",
        userId: "seed_user_maria",
        email: "maria.pro@example.com",
        fullName: "Maria Rodriguez",
        displayName: "Maria",
        country: "Venezuela",
        city: "Remoto",
        licenseNumber: "CRED-MARIA",
        licenseCountry: "Venezuela",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["familia_ninos", "perdida_vivienda"]),
        remoteAvailable: true,
        crisisExperience: true,
        contactEmail: "maria.pro@example.com",
        status: "approved",
        acceptingRequests: true,
        maxActiveRequests: 4,
        currentActiveRequests: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pro_seed_pending_1",
        userId: "seed_user_pending_1",
        email: "pendiente1@example.com",
        fullName: "Profesional Pendiente Uno",
        displayName: "Pendiente 1",
        licenseNumber: "PEND-1",
        licenseCountry: "Venezuela",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["orientacion_general"]),
        remoteAvailable: true,
        crisisExperience: false,
        contactEmail: "pendiente1@example.com",
        status: "pending_verification",
        acceptingRequests: false,
        maxActiveRequests: 3,
        currentActiveRequests: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pro_seed_pending_2",
        userId: "seed_user_pending_2",
        email: "pendiente2@example.com",
        fullName: "Profesional Pendiente Dos",
        displayName: "Pendiente 2",
        licenseNumber: "PEND-2",
        licenseCountry: "Venezuela",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo"]),
        remoteAvailable: true,
        crisisExperience: true,
        contactEmail: "pendiente2@example.com",
        status: "pending_verification",
        acceptingRequests: false,
        maxActiveRequests: 3,
        currentActiveRequests: 0,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(helpRequests)
    .values({
      id: "req_seed_1",
      email: "persona@example.com",
      language: "es",
      country: "Venezuela",
      needCategory: "duelo",
      urgency: "media",
      consentContact: true,
      locationConsent: false,
      status: "new",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  console.log("Seed listo.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
