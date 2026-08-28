import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.module.js';
import { categories } from '../db/schema/index.js';
import { isForeignKeyViolation } from '../common/db-errors.util.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { UpdateCategoryDto } from './dto/update-category.dto.js';

export type Category = typeof categories.$inferSelect;
type MovementType = Category['type'];

// H3 (spec 002), criterio 1 / `spec.md` §4: semilla de categorías iniciales,
// editable por el usuario (no fija) — se crean automáticamente al
// registrarse, no son compartidas/globales entre usuarios.
const DEFAULT_INCOME_CATEGORIES = [
  'Nómina',
  'Dividendo',
  'Intereses',
  'Acciones (venta)',
  'Cashback',
  'Descuentos',
  'Lotería',
  'Regalo',
  'Dietas',
  'Otros',
];

const DEFAULT_EXPENSE_CATEGORIES = [
  'Comida',
  'Transporte',
  'Salud',
  'Vivienda/Alquiler',
  'Coche',
  'Ropa',
  'Suscripciones',
  'Utilities',
  'Ocio/Caprichos',
  'Apuestas',
  'Asociaciones',
  'Varios',
];

/**
 * H3 (spec 002). Igual que el resto de servicios de datos económicos
 * (`plan.md` §3): ningún método acepta una consulta sin `userId` explícito —
 * no existe un "buscar por id" que no filtre por dueño.
 */
@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(userId: string, type?: MovementType): Promise<Category[]> {
    const conditions = type ? and(eq(categories.userId, userId), eq(categories.type, type)) : eq(categories.userId, userId);
    return this.db.query.categories.findMany({ where: conditions, orderBy: [asc(categories.name)] });
  }

  /**
   * H3 criterio 2. `parentId` (si se manda) debe ser una categoría propia,
   * de gasto, y que no sea a su vez una subcategoría — dos niveles como
   * mucho (`spec.md` §6, decisión 1). Un padre que no existe o que
   * pertenece a otro usuario se trata como "no encontrado" (404), no como
   * "prohibido" (403): mismo criterio de no confirmar recursos ajenos que
   * ya usa el resto de la app (ver `SessionsController`, spec 001).
   */
  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      if (dto.type !== 'EXPENSE') {
        throw new BadRequestException('Las subcategorías solo existen para categorías de gasto.');
      }
      const parent = await this.findOwn(userId, dto.parentId);
      if (!parent) {
        throw new NotFoundException('Categoría padre no encontrada.');
      }
      if (parent.type !== 'EXPENSE') {
        throw new BadRequestException('La categoría padre debe ser de tipo gasto.');
      }
      if (parent.parentId) {
        throw new BadRequestException('No se pueden crear subcategorías de una subcategoría.');
      }
    }

    const [category] = await this.db
      .insert(categories)
      .values({ userId, type: dto.type, name: dto.name, parentId: dto.parentId ?? null })
      .returning();
    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.findOwnOrThrow(userId, id);
    const [updated] = await this.db
      .update(categories)
      .set({ name: dto.name })
      .where(eq(categories.id, id))
      .returning();
    return updated;
  }

  /**
   * H3 (spec.md §5) — no cubierto por un criterio de aceptación explícito de
   * "borrar", pero es necesario para que crear/renombrar/borrar sea un CRUD
   * completo. `ON DELETE RESTRICT` (plan.md §1) hace que Postgres rechace el
   * borrado si hay movimientos o subcategorías que todavía referencian esta
   * categoría — se traduce ese fallo a un 409 explícito en vez de dejar que
   * suba como un 500 sin contexto (`isForeignKeyViolation`).
   */
  async remove(userId: string, id: string): Promise<void> {
    await this.findOwnOrThrow(userId, id);
    try {
      await this.db.delete(categories).where(eq(categories.id, id));
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          'No se puede eliminar: tiene movimientos o subcategorías asociadas. Elimínalos primero.',
        );
      }
      throw err;
    }
  }

  /**
   * H3 criterio 1: se llama desde `AuthService.register` (spec 002, T1.3)
   * justo después de crear el usuario, sin semilla de subcategorías (el
   * usuario puede añadirlas si quiere) — sin límite de profundidad de
   * semilla, ninguna categoría por defecto tiene `parentId`.
   */
  async seedDefaults(userId: string): Promise<void> {
    await this.db.insert(categories).values([
      ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ userId, type: 'INCOME' as const, name, isDefault: true })),
      ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ userId, type: 'EXPENSE' as const, name, isDefault: true })),
    ]);
  }

  private async findOwn(userId: string, id: string): Promise<Category | undefined> {
    return this.db.query.categories.findFirst({ where: and(eq(categories.id, id), eq(categories.userId, userId)) });
  }

  private async findOwnOrThrow(userId: string, id: string): Promise<Category> {
    const category = await this.findOwn(userId, id);
    if (!category) {
      throw new NotFoundException('Categoría no encontrada.');
    }
    return category;
  }
}
