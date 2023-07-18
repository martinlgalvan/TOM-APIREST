import yup from 'yup'

const loginScheme = yup.object({
    email: yup.string().email("El email debe tener un formato correcto.").required("Por favor ingrese un email"),
    password: yup.string().required("Por favor ingrese una contraseña.")
}).noUnknown()

const registerScheme = yup.object({

    name: yup.string().required("Por favor ingresá un nombre."),
    email: yup.string().email("El email debe tener un formato correcto.").required("Por favor ingrese un email"),
    password: yup.string().required("Por favor ingrese una contraseña."),
    logo: yup.string().required(),
}).noUnknown()


export {
    loginScheme,
    registerScheme
}