
import { $query, $update, Record, StableBTreeMap, Vec, match, Result, nat64, ic, Opt, Principal } from 'azle'
import { v4 as uuidv4 } from 'uuid'
 

type ToDo = Record<{
    owner: Principal
    id: string
    title: string
    body: string
    tag: string
    completed: boolean
    created_at: nat64
    updated_at: Opt<nat64>
}>

type ToDoPayload = Record<{
    title: string
    body: string
    tag: string
}>

const todosStorage = new StableBTreeMap<string, ToDo>(0, 44, 512)

// fetches all to dos of the caller
$query
export function getToDos(): Result<Vec<ToDo>, string> {
    return Result.Ok(todosStorage.values().filter((todo) => todo.owner.toString() === ic.caller.toString()))
}

// fetches all to dos of the caller by their tag
$query
export function getToDosByTag(tag: string, startIndex: nat64, endingIndex: nat64): Result<Vec<ToDo>, string> {
    const length = todosStorage.len()
    // prevents out of bounds errors
    if(length < startIndex || length < endingIndex){
        return Result.Err("One of the indexes are out of bounds.")
    }
    if(startIndex > endingIndex){
        return Result.Err(`The startIndex: ${startIndex} can't be greater than the endingIndex: ${endingIndex}.`)
    }
    // ensures that only two items can be fetched at a time
    if(endingIndex - startIndex > 2){
        return Result.Err("You can only fetch two items at a time")
    }
    const toDos = todosStorage.items();
    const filteredToDos : Vec<ToDo> = [];
    for(let i = startIndex; i < endingIndex;i++){
        const todo = toDos[Number(i)][1]; 
        // add only to dos that matches the tag and are owned by the caller
        if(todo.tag == tag && todo.owner.toString() === ic.caller().toString()){
            filteredToDos.push(todo);
        }
    }
    
    return Result.Ok(filteredToDos)
}

// fetches a to do
$query
export function getToDo(id: string): Result<ToDo, string> {
    return match(todosStorage.get(id), {
        Some: (todo) => {
            if(todo.owner.toString() !== ic.caller().toString()){
                Result.Err<ToDo, string>("Not owner of todo")
            }
            return Result.Ok<ToDo, string>(todo)
        },
        None: () => Result.Err<ToDo, string>(`a todo with id=${id} not found`)
    })
}

// Allow users to create and add a to do
$update
export function addToDo(payload: ToDoPayload): Result<ToDo, string> {
    // ensures no empty string is found in the payload(except the tag)
    const err = checkPayload(payload);
    // return the error if any
    if(err.length > 0){
        return Result.Err<ToDo,string>(err)
    }
    const todo: ToDo = { owner: ic.caller() , id: uuidv4(), created_at: ic.time(), updated_at: Opt.None, completed: false, ...payload }
    todosStorage.insert(todo.id, todo)
    return Result.Ok(todo)
}


// Allow users to update the tag, body and/or title of their to dos
// Caller must be the owner of the to do
$update
export function updateToDo(id: string, payload: ToDoPayload): Result<ToDo, string> {
     // ensures no empty string is found in the payload(except the tag)
    const err = checkPayload(payload);
    // return the error if any
    if(err.length > 0){
        return Result.Err<ToDo,string>(err)
    }
    return match(todosStorage.get(id), {
        Some: (todo) => {
            if(todo.owner.toString() !== ic.caller().toString()){
                return Result.Err<ToDo, string>("You are not the owner of this to do")
            }
            const updatedToDo: ToDo = {...todo, ...payload, updated_at: Opt.Some(ic.time())}
            todosStorage.insert(todo.id, updatedToDo)
            return Result.Ok<ToDo, string>(updatedToDo)
        },
        None: () => Result.Err<ToDo, string>(`couldn't update a todo with id=${id}. todo not found`)
    })
}

// Allow users to delete their to dos
// Caller must be the owner of the to do
$update
export function deleteToDo(id: string): Result<ToDo, string> {
    return match(todosStorage.get(id), {
        Some: (deletedtodo) => {
            if(deletedtodo.owner.toString() !== ic.caller().toString()){
                return Result.Err<ToDo, string>("You are not the owner of this to do")
            }
            todosStorage.remove(id)
            return Result.Ok<ToDo, string>(deletedtodo)
        },
        None: () => Result.Err<ToDo, string>(`couldn't delete a todo with id=${id}. todo not found.`)
    })
}

/**
 * Allow users to set their to dos as completed
*/ 
$update
export function completeToDo(id: string): Result<ToDo, string> {
    return match(todosStorage.get(id), {
        Some: (todo) => {
            // if not to do's owner, return an error
            if(todo.owner.toString() !== ic.caller().toString()){
                return Result.Err<ToDo, string>("You are not the owner of this to do")
            }
            // if to do is already completed, return an error
            if(todo.completed){
                return Result.Err<ToDo, string>(`To-do with ${id} has already been completed.`)
            }
            // if all checks have passed, update to do's completed property to true and the updated_at property to the current timestamp
            const updatedToDo: ToDo = {...todo, completed: true, updated_at: Opt.Some(ic.time())}
            todosStorage.insert(todo.id, updatedToDo)
            return Result.Ok<ToDo, string>(updatedToDo)
        },
        None: () => Result.Err<ToDo, string>(`couldn't update a todo with id=${id}. todo not found`)
    })
}

// function that ensures that the title and body of the payload aren't empty strings
function checkPayload(payload: ToDoPayload): string {
    if(payload.title.length == 0){
        return "Empty title";
    }
    if(payload.body.length == 0){
        return "Empty body";
    }
    return "";
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
    getRandomValues: () => {
        let array = new Uint8Array(32)

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256)
        }

        return array
    }
}
