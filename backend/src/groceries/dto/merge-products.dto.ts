import { ArrayMinSize, ArrayUnique, IsUUID } from 'class-validator';

/** Spec 038 (H1-H2): el producto que sobrevive y los que se fusionan en él (borrados tras la fusión). */
export class MergeProductsDto {
  @IsUUID()
  survivorId!: string;

  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayUnique()
  mergedIds!: string[];
}
