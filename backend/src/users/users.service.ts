import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<Omit<User, 'password_hash'>> {
    const { nombre_completo, credencial, password, rol } = createUserDto;

    try {
      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);

      const newUser = this.userRepository.create({
        nombre_completo,
        credencial,
        password_hash,
        rol,
      });

      const savedUser = await this.userRepository.save(newUser);
      const { password_hash: _, ...userWithoutPassword } = savedUser;
      
      return userWithoutPassword;
    } catch (error) {
      if ((error as any).code === '23505') {
        throw new ConflictException('La credencial ingresada ya está registrada');
      }
      throw new InternalServerErrorException('Error al crear el usuario');
    }
  }
}