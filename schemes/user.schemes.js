import yup from 'yup'

const loginScheme = yup.object({
    email: yup.string().email("El email debe tener un formato correcto.").required("Por favor ingrese un email"),
    password: yup.string().required("Por favor ingrese una contrasena.")
}).noUnknown()

const registerScheme = yup.object({

    name: yup.string().required("Por favor ingresa un nombre."),
    email: yup.string().email("El email debe tener un formato correcto.").required("Por favor ingrese un email"),
    password: yup.string().required("Por favor ingrese una contrasena."),
    logo: yup.string().required(),
    // Opcional: si viene, se asigna en el mismo request en vez de obligar al
    // front a hacer un PATCH extra despues de crear al alumno.
    // Ojo: el schema tiene .noUnknown(), asi que un campo no declarado aca se
    // descarta en silencio y nunca llega al controller.
    category: yup.string().notRequired(),
}).noUnknown()


export {
    loginScheme,
    registerScheme
}