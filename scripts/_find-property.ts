import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const props = await prisma.propertyCurrent.findMany({
    take: 5,
    select: {
      codigoInmueble: true,
      ciudad: true,
      precioVenta: true,
      tipoOfer: true,
      metrosConstruidos: true,
    },
    where: {
      precioVenta: { gt: 0 },
    },
  });
  console.log(JSON.stringify(props, null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
