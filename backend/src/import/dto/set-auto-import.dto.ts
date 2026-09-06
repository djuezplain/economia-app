import { IsBoolean } from 'class-validator';

/** H3 (spec 026). */
export class SetAutoImportDto {
  @IsBoolean()
  enabled!: boolean;
}
