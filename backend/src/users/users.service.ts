import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UpdatePermisosDto } from './dto/update-permisos.dto'; // HU-1.4 · Modificar permisos de usuarios
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  User,
  RolUsuario,
  TODOS_LOS_PERMISOS,
  PERMISOS_POR_ROL,
  permisosEfectivos,
} from './entities/user.entity';
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
        permisos: [...PERMISOS_POR_ROL[rol]], // HU-1.4
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

  async findByCredencial(credencial: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { credencial } });
  }

  /** HU-1.4 · Lista los usuarios (sin password_hash) con sus permisos efectivos */
  async findAll(): Promise<Omit<User, 'password_hash'>[]> {
    const usuarios = await this.userRepository.find({
      select: {
        id_usuario: true,
        nombre_completo: true,
        credencial: true,
        rol: true,
        estado_activo: true,
        permisos: true,
      },
      order: { nombre_completo: 'ASC' },
    });
    return usuarios.map((u) => ({ ...u, permisos: permisosEfectivos(u) }));
  }


  /**
   * HU-1.4 · Cambia el rol, el estado y las funcionalidades de un usuario.
   *  - Usuario inexistente        -> 404 y no se realiza ningún cambio
   *  - Admin quitándose su propio acceso -> 400 (evita quedarse sin administradores)
   */
  async updatePermisos(
    id: number,
    dto: UpdatePermisosDto,
    idSolicitante: number,
  ): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.findOne({ where: { id_usuario: id } });
    if (!user) {
      throw new NotFoundException('El usuario seleccionado no existe o no está disponible');
    }

    const pierdeAcceso = dto.rol !== user.rol || dto.estado_activo === false;
    if (id === idSolicitante && pierdeAcceso) {
      throw new BadRequestException(
        'No puede cambiar su propio rol ni desactivarse a sí mismo',
      );
    }

    user.rol = dto.rol;
    if (dto.estado_activo !== undefined) user.estado_activo = dto.estado_activo;
    if (dto.permisos !== undefined) user.permisos = dto.permisos;
    // El Administrador siempre conserva todas las funcionalidades
    if (user.rol === RolUsuario.ADMINISTRADOR) user.permisos = [...TODOS_LOS_PERMISOS];

    const guardado = await this.userRepository.save(user);
    const { password_hash: _, ...sinClave } = guardado;
    return { ...sinClave, permisos: permisosEfectivos(guardado) };
  }













}