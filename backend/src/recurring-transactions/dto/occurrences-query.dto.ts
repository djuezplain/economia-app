import { IsDateString } from 'class-validator';

export class OccurrencesQueryDto {
  @IsDateString({ strict: true })
  from!: string;

  @IsDateString({ strict: true })
  to!: string;
}
